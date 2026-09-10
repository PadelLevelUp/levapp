import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGuardianRevoke, revokeGuardianConsent, type GuardianRevokeRequest } from "@/api/auth";

type Phase = "loading" | "confirm" | "done" | "expired" | "failed";

/**
 * auth.parental-consent rule 9 (PAD-198) — the permanent withdraw link from the
 * guardian's confirmation email. This page IS the confirmation step: it states
 * plainly that the account and its data are removed and that this cannot be
 * undone, and nothing happens until the button is pressed. Web only (R-024
 * exception: the guardian arrives from an email).
 */
const GuardianRevokePage = () => {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [request, setRequest] = useState<GuardianRevokeRequest | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    getGuardianRevoke(token)
      .then((data) => {
        if (!alive) return;
        setRequest(data);
        setPhase("confirm");
      })
      .catch((err) => {
        if (!alive) return;
        setPhase((err as { response?: { status?: number } }).response?.status === 410 ? "expired" : "failed");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const confirm = async () => {
    setWorking(true);
    try {
      await revokeGuardianConsent(token);
      setPhase("done");
    } catch (err) {
      setPhase((err as { response?: { status?: number } }).response?.status === 410 ? "expired" : "failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />
      <Card className="w-full max-w-md" data-testid="guardian-revoke">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">{t("auth.guardianRevoke.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === "loading" && <p className="text-center text-sm">{t("auth.guardianRevoke.loading")}</p>}
          {phase === "expired" && (
            <p className="text-center text-sm" data-testid="revoke-expired">
              {t("auth.guardianRevoke.expired")}
            </p>
          )}
          {phase === "failed" && (
            <p className="text-center text-sm text-destructive" data-testid="revoke-failed">
              {t("auth.guardianRevoke.failed")}
            </p>
          )}
          {phase === "done" && (
            <p className="text-center text-sm" data-testid="revoke-done">
              {t("auth.guardianRevoke.done")}
            </p>
          )}
          {phase === "confirm" && request && (
            <>
              <p className="text-sm" data-testid="revoke-warning">
                {t("auth.guardianRevoke.body", { name: request.minor.name, username: request.minor.username })}
              </p>
              <Button
                variant="destructive"
                className="w-full"
                disabled={working}
                onClick={() => void confirm()}
                data-testid="revoke-confirm"
              >
                {working ? t("auth.guardianRevoke.confirming") : t("auth.guardianRevoke.confirm")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GuardianRevokePage;
