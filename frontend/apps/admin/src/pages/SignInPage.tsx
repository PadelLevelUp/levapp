import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui";
import { ApiError, type AuthConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { renderGoogleButton } from "@/lib/google";

const KNOWN_ERRORS = new Set(["NOT_STAFF_DOMAIN", "NO_ADMIN_ROLE", "GOOGLE_TOKEN_INVALID", "ADMIN_NOT_CONFIGURED", "NETWORK"]);

export function SignInPage({ config, render = renderGoogleButton }: { config: AuthConfig; render?: typeof renderGoogleButton }) {
  const { t, i18n } = useTranslation();
  const { signInWithCredential } = useAuth();
  const slot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [buttonReady, setButtonReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!slot.current) return;
    render(
      slot.current,
      config.googleClientId,
      (credential) => {
        setError(null);
        signInWithCredential(credential).catch((err: unknown) => {
          const code = err instanceof ApiError ? err.code : "generic";
          setError(KNOWN_ERRORS.has(code) ? code : "generic");
        });
      },
      i18n.language,
    )
      .then(() => {
        if (!cancelled) setButtonReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("NETWORK");
      });
    return () => {
      cancelled = true;
    };
  }, [config.googleClientId, i18n.language, render, signInWithCredential]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center" data-testid="admin-sign-in">
        <div className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("admin.shell.title")}</div>
        <h1 className="mt-2 font-display text-2xl font-semibold">{t("admin.signIn.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("admin.signIn.lead")}</p>
        <div className="mt-6 flex justify-center">
          <div ref={slot} data-testid="admin-google-button" />
        </div>
        {!buttonReady && !error ? <p className="mt-3 text-xs text-muted-foreground">{t("admin.signIn.loading")}</p> : null}
        {error ? (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="admin-sign-in-error">
            {t(`admin.signIn.error.${error}`)}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
