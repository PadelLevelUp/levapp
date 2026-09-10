import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { confirmPasswordRecovery, getMe, requestPasswordRecovery } from "@/api/auth";
import { useAuth } from "@/auth/AuthContext";
import { postLoginLanding } from "@/auth/postLoginPath";

/**
 * auth.password-recovery rule 8 — the two-step recovery screen reached from
 * "Forgot your password?" on /auth. Step 1 asks for the account email and
 * ALWAYS moves on with neutral copy (the server never says whether the email
 * has an account). Step 2 takes the mailed 6-digit code and a new password
 * and signs the person in exactly as a fresh login would. The mail also
 * carries the username, so "I forgot my username" is the same flow.
 */
const CODE_LENGTH = 6;
const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type ApiError = { response?: { status?: number; data?: { error?: string; attemptsLeft?: number; retryAfterSeconds?: number } } };

const ForgotPasswordPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [countdown, setCountdown] = useState(0);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [countdown]);

  const send = useCallback(async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setEmailError(t("auth.recovery.invalidEmail"));
      return;
    }
    setSending(true);
    setEmailError(null);
    setCodeError(null);
    try {
      const res = await requestPasswordRecovery(value);
      setCountdown(res.resendAvailableInSeconds);
      setCode("");
      setStep("code");
    } catch (err) {
      const res = (err as ApiError).response;
      setEmailError(
        res?.status === 429
          ? t("auth.login.rateLimited", { seconds: res.data?.retryAfterSeconds ?? 60 })
          : res?.status === 400
            ? t("auth.recovery.invalidEmail")
            : t("auth.login.networkError"),
      );
    } finally {
      setSending(false);
    }
  }, [email, t]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    let bad = false;
    if (password.length < PASSWORD_MIN) {
      setPasswordError(t("auth.recovery.weakPassword", { count: PASSWORD_MIN }));
      bad = true;
    }
    if (code.length !== CODE_LENGTH) {
      setCodeError(t("auth.recovery.codeIncomplete"));
      bad = true;
    }
    if (bad) return;
    setSubmitting(true);
    setCodeError(null);
    setPasswordError(null);
    try {
      const res = await confirmPasswordRecovery({ email: email.trim(), code, newPassword: password });
      await login(res.accessToken);
      const me = await getMe();
      toast({ title: t("auth.recovery.changedTitle"), description: t("auth.recovery.changedDescription") });
      navigate(postLoginLanding(me), { replace: true });
    } catch (err) {
      const data = (err as ApiError).response?.data;
      const status = (err as ApiError).response?.status;
      if (status === 400 && data?.error === "WEAK_PASSWORD") {
        setPasswordError(t("auth.recovery.weakPassword", { count: PASSWORD_MIN }));
      } else if (status === 400 && data?.error === "INVALID_CODE") {
        const left = data.attemptsLeft ?? 0;
        setCode("");
        setCodeError(left > 0 ? t("auth.verifyEmail.invalidCode", { count: left }) : t("auth.verifyEmail.invalidCodeLocked"));
      } else if (status === 410) {
        setCode("");
        setCodeError(t("auth.verifyEmail.expired"));
      } else if (status === 429) {
        // auth.password-recovery rule 10 (PAD-228).
        setCodeError(t("auth.login.rateLimited", { seconds: data?.retryAfterSeconds ?? 60 }));
      } else {
        setCodeError(t("auth.login.networkError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="forgot-password">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.recovery.title")}</CardTitle>
          <CardDescription>
            {step === "email" ? t("auth.recovery.description") : t("auth.recovery.codeDescription")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {step === "email" ? (
            <form
              className="space-y-4"
              data-testid="recovery-email-step"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="recovery-email">{t("auth.recovery.email")}</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder={t("auth.recovery.emailPlaceholder")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                />
                {emailError && (
                  <p className="text-sm text-destructive" data-testid="recovery-email-error">
                    {emailError}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={sending} data-testid="recovery-send">
                {sending ? t("auth.recovery.sending") : t("auth.recovery.send")}
              </Button>
            </form>
          ) : (
            <form className="space-y-5" data-testid="recovery-code-step" onSubmit={(e) => void submit(e)}>
              <p className="text-sm text-muted-foreground text-center" data-testid="recovery-neutral-copy">
                {t("auth.recovery.neutral", { email: email.trim() })}
              </p>

              <div className="flex flex-col items-center gap-3">
                <InputOTP
                  maxLength={CODE_LENGTH}
                  pattern={REGEXP_ONLY_DIGITS}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  disabled={submitting}
                  onChange={(v) => {
                    setCode(v);
                    if (codeError) setCodeError(null);
                  }}
                  aria-label={t("auth.recovery.codeLabel")}
                  data-testid="recovery-code"
                  containerClassName="justify-center"
                >
                  <InputOTPGroup className="gap-2">
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-14 w-11 rounded-md border text-2xl font-semibold tabular-nums first:rounded-l-md last:rounded-r-md"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p
                  className={codeError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
                  aria-live="polite"
                  data-testid={codeError ? "recovery-error" : "recovery-hint"}
                >
                  {codeError ?? t("auth.recovery.hint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recovery-password">{t("auth.recovery.newPassword")}</Label>
                <Input
                  id="recovery-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError(null);
                  }}
                />
                {passwordError && (
                  <p className="text-sm text-destructive" data-testid="recovery-password-error">
                    {passwordError}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={submitting} data-testid="recovery-submit">
                {submitting ? t("auth.recovery.submitting") : t("auth.recovery.submit")}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={countdown > 0 || sending}
                onClick={() => void send()}
                data-testid="recovery-resend"
              >
                {countdown > 0
                  ? t("auth.verifyEmail.resendIn", { seconds: countdown })
                  : t("auth.verifyEmail.resend")}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link to="/auth" className="underline hover:text-foreground" data-testid="recovery-back">
              {t("auth.recovery.back")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
