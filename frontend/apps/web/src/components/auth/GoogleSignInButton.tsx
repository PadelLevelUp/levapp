import { CONTACT_EMAIL } from "@levelup/config";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { socialSignIn, type SocialSignInResponse } from "@/api/auth";
import { googleWebClientId, loadGoogleIdentity, renderGoogleButton } from "@/lib/googleIdentity";

type Props = {
  /** The server's answer: a login body, or `needsProfile`. The page routes it. */
  onResult: (result: SocialSignInResponse) => void | Promise<void>;
  text?: "signin_with" | "signup_with" | "continue_with";
};

/**
 * auth.social-sign-in rule 7 (PAD-618): "Continuar com Google", only where the build carries
 * `VITE_GOOGLE_WEB_CLIENT_ID`. Google draws the button; this posts its ID token to /auth/social.
 */
export function GoogleSignInButton({ onResult, text = "continue_with" }: Props) {
  const clientId = googleWebClientId();
  if (!clientId) return null;
  return <GoogleButton clientId={clientId} onResult={onResult} text={text} />;
}

function GoogleButton({ clientId, onResult, text }: Props & { clientId: string; text: NonNullable<Props["text"]> }) {
  const { t } = useTranslation();
  const slot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest handler, without re-rendering Google's button when the page re-renders.
  const handler = useRef(onResult);
  handler.current = onResult;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let cancelled = false;
    const onCredential = async (idToken: string) => {
      setError(null);
      try {
        const res = await socialSignIn({ provider: "google", idToken });
        await handler.current(res);
      } catch (err) {
        const response = (err as { response?: { status?: number; data?: { error?: string } } }).response;
        const status = response?.status;
        const code = response?.data?.error;
        // The login refusals (auth.social-sign-in rule 3) get their own words: a Google-only account
        // has no password, so "sign in with your password" would be a dead end.
        setError(
          status === 503
            ? tRef.current("auth.social.errorUnavailable")
            : code === "ACCOUNT_EMAIL_UNVERIFIED"
              ? tRef.current("auth.social.errorEmailUnverified")
            : code === "COACH_REJECTED"
              ? tRef.current("auth.social.errorCoachRejected", { email: CONTACT_EMAIL })
              : code === "ACCOUNT_DISABLED"
                ? tRef.current("auth.social.errorDisabled")
                : status
                  ? tRef.current("auth.social.errorInvalid")
                  : tRef.current("auth.social.errorNetwork"),
        );
      }
    };
    loadGoogleIdentity()
      .then(() => {
        if (!cancelled && slot.current) {
          slot.current.replaceChildren();
          renderGoogleButton(slot.current, { clientId, text, onCredential });
        }
      })
      .catch(() => {
        if (!cancelled) setError(tRef.current("auth.social.errorNetwork"));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span>{t("auth.social.divider")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div ref={slot} data-testid="google-sign-in" className="flex justify-center" />
      {error && (
        <p className="text-center text-sm text-destructive" data-testid="google-sign-in-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
