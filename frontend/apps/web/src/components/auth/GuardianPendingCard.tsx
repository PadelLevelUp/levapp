import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resendGuardianConsent, type GuardianPendingInfo } from "@/api/auth";

type ApiError = {
  response?: { status?: number; data?: { error?: string; field?: string; retryAfterSeconds?: number } };
};

/**
 * auth.parental-consent rule 10 (PAD-198) — shown after a minor's sign-up and
 * after a login answered 403 GUARDIAN_CONSENT_PENDING. There is no session, so
 * "send again" re-uses the credentials the person just typed.
 */
export function GuardianPendingCard({
  username,
  password,
  info,
  onBack,
}: {
  username: string;
  password: string;
  info: GuardianPendingInfo;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [email, setEmail] = useState(info.guardianEmail ?? "");
  const [countdown, setCountdown] = useState(info.resendAvailableInSeconds ?? 60);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = window.setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [countdown]);

  const send = async (guardianEmail?: string) => {
    setSending(true);
    setError(null);
    try {
      const res = await resendGuardianConsent({ username, password, ...(guardianEmail ? { guardianEmail } : {}) });
      setEmail(res.guardianEmail ?? email);
      setCountdown(res.resendAvailableInSeconds);
      setEditing(false);
      setNewEmail("");
      toast({ title: t("auth.guardianPending.sent") });
    } catch (err) {
      const res = (err as ApiError).response;
      if (res?.status === 429) {
        const seconds = res.data?.retryAfterSeconds ?? 60;
        setCountdown(seconds);
        setError(t("auth.guardianPending.tooSoon", { seconds }));
      } else if (res?.status === 400 && res.data?.field === "guardianEmail") {
        setError(
          res.data.error === "GUARDIAN_EMAIL_IS_OWN" ? t("auth.signup.guardianEmailIsOwn") : t("auth.signup.guardianEmailInvalid"),
        );
      } else {
        setError(t("auth.guardianPending.failed"));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="guardian-pending">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold">{t("auth.guardianPending.title")}</p>
        <p className="text-sm text-muted-foreground" data-testid="guardian-pending-email">
          {t("auth.guardianPending.description", { email })}
        </p>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Label htmlFor="guardian-pending-new">{t("auth.guardianPending.newEmail")}</Label>
          <Input
            id="guardian-pending-new"
            type="email"
            autoComplete="off"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setError(null);
            }}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={sending || countdown > 0 || !newEmail.trim()}
              onClick={() => void send(newEmail.trim())}
              data-testid="guardian-pending-save"
            >
              {countdown > 0 ? t("auth.guardianPending.resendIn", { seconds: countdown }) : t("auth.guardianPending.save")}
            </Button>
            <Button variant="outline" disabled={sending} onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button
            variant="outline"
            className="w-full"
            disabled={sending || countdown > 0}
            onClick={() => void send()}
            data-testid="guardian-pending-resend"
          >
            {countdown > 0 ? t("auth.guardianPending.resendIn", { seconds: countdown }) : t("auth.guardianPending.resend")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setEditing(true)} data-testid="guardian-pending-change">
            {t("auth.guardianPending.change")}
          </Button>
        </>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" data-testid="guardian-pending-error">
          {error}
        </p>
      )}

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={onBack} data-testid="guardian-pending-back">
        {t("auth.guardianPending.back")}
      </Button>
    </div>
  );
}
