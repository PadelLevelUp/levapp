import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { REGEXP_ONLY_DIGITS } from "input-otp";
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
import {
  confirmEmailVerificationCode,
  sendEmailVerificationCode,
  updateMe,
} from "@/api/auth";
import { useAuth } from "@/auth/AuthContext";
import { postLoginLanding } from "@/auth/postLoginPath";
import { MailCheck } from "lucide-react";

/**
 * auth.email-verification rule 8 — the screen that holds a `pending` user
 * until the 6-digit code from their inbox is typed back. Also reached from
 * Settings ("Verify") for an `unverified` email, in which case the first
 * code is requested on mount. `?next=` is where to go once verified; without
 * it the user lands where a fresh login would.
 */
const CODE_LENGTH = 6;

type ApiError = { response?: { status?: number; data?: { error?: string; attemptsLeft?: number; retryAfterSeconds?: number } } };

function safeNext(raw: string | null): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

const VerifyEmailPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const { user, logout, refreshUser } = useAuth();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState<number>(user?.emailVerificationResendInSeconds ?? 60);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const autoSent = useRef(false);

  const next = safeNext(params.get("next"));
  const email = user?.email ?? "";

  const leave = useCallback(
    (me = user) => navigate(next ?? postLoginLanding(me), { replace: true }),
    [navigate, next, user],
  );

  // Countdown for "Send a new code" (rule 8: 60 s after each send).
  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [countdown]);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await sendEmailVerificationCode();
      setCountdown(res.resendAvailableInSeconds);
      setCode("");
      toast({ title: t("auth.verifyEmail.sent") });
    } catch (err) {
      const data = (err as ApiError).response?.data;
      const status = (err as ApiError).response?.status;
      if (status === 429 && data?.retryAfterSeconds) {
        // Rule 8a / B-031: "too soon" means a code is already in the inbox.
        // The counting-down button says so; nothing turns red.
        setCountdown(data.retryAfterSeconds);
      } else if (status === 409) {
        void refreshUser().then((me) => leave(me ?? user));
      } else {
        setError(t("auth.verifyEmail.mailFailed"));
      }
    } finally {
      setSending(false);
    }
  }, [leave, refreshUser, t, toast, user]);

  // Already verified: nothing to do here. Never asked (Settings → Verify):
  // request the first code now. A `pending` user is NOT asked again — signup
  // and a Settings email change already sent one (rule 8a); the countdown
  // seeded from /me above is the whole story.
  useEffect(() => {
    if (!user) return;
    if (user.emailVerification === "verified" || !user.email) {
      leave();
      return;
    }
    if (user.emailVerification !== "pending" && !autoSent.current) {
      autoSent.current = true;
      setCountdown(0);
      void send();
    }
  }, [user, leave, send]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const me = await confirmEmailVerificationCode(value);
        await refreshUser();
        toast({ title: t("auth.verifyEmail.verified") });
        leave(me);
      } catch (err) {
        const data = (err as ApiError).response?.data;
        const status = (err as ApiError).response?.status;
        setCode("");
        if (status === 400 && data?.error === "INVALID_CODE") {
          const left = data.attemptsLeft ?? 0;
          setError(left > 0 ? t("auth.verifyEmail.invalidCode", { count: left }) : t("auth.verifyEmail.invalidCodeLocked"));
        } else if (status === 410) {
          setError(t("auth.verifyEmail.expired"));
        } else {
          setError(t("auth.login.networkError"));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [leave, refreshUser, submitting, t, toast],
  );

  const saveEmail = async () => {
    const value = newEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setEmailError(t("auth.signup.emailInvalid"));
      return;
    }
    setSavingEmail(true);
    setEmailError(null);
    try {
      // settings.profile rule 9: a new address gets its own code server-side.
      const me = await updateMe({ email: value });
      await refreshUser();
      setEditing(false);
      setNewEmail("");
      setCode("");
      setError(null);
      setCountdown(me.emailVerificationResendInSeconds ?? 60);
      toast({ title: t("auth.verifyEmail.sent") });
    } catch (err) {
      const status = (err as ApiError).response?.status;
      setEmailError(status === 409 ? t("auth.signup.emailTaken") : t("auth.signup.emailInvalid"));
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="verify-email">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.verifyEmail.title")}</CardTitle>
          <CardDescription>
            {t("auth.verifyEmail.description")}{" "}
            <span className="font-medium text-foreground" data-testid="verify-email-address">
              {email}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {editing ? (
            <div className="space-y-2" data-testid="verify-email-edit">
              <Label htmlFor="verify-email-new">{t("auth.verifyEmail.newEmail")}</Label>
              <Input
                id="verify-email-new"
                type="email"
                autoComplete="email"
                autoFocus
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && void saveEmail()}
                data-testid="verify-email-new-address"
              />
              {emailError && (
                <p className="text-sm text-destructive" data-testid="verify-email-new-error">
                  {emailError}
                </p>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" disabled={savingEmail} onClick={() => void saveEmail()} data-testid="verify-email-save-address">
                  {t("auth.verifyEmail.saveEmail")}
                </Button>
                <Button variant="outline" disabled={savingEmail} onClick={() => setEditing(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <>
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
                    if (error) setError(null);
                  }}
                  onComplete={(v) => void submit(v)}
                  aria-label={t("auth.verifyEmail.codeLabel")}
                  data-testid="verify-email-code"
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
                  className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
                  aria-live="polite"
                  data-testid={error ? "verify-email-error" : "verify-email-hint"}
                >
                  {error ?? (submitting ? t("auth.verifyEmail.verifying") : t("auth.verifyEmail.hint"))}
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full"
                disabled={countdown > 0 || sending}
                onClick={() => void send()}
                data-testid="verify-email-resend"
              >
                {countdown > 0
                  ? t("auth.verifyEmail.resendIn", { seconds: countdown })
                  : t("auth.verifyEmail.resend")}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setNewEmail(email);
                  setEditing(true);
                }}
                data-testid="verify-email-change"
              >
                {t("auth.verifyEmail.changeEmail")}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            data-testid="verify-email-signout"
            onClick={() => {
              logout();
              navigate("/auth", { replace: true });
            }}
          >
            {t("auth.verifyEmail.signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmailPage;
