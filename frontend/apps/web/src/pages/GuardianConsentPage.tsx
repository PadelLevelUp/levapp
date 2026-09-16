import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { countryName } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  declineGuardianConsent,
  getGuardianConsent,
  giveGuardianConsent,
  type GuardianConsentPayload,
  type GuardianConsentRequest,
} from "@/api/auth";

type ApiError = { response?: { status?: number; data?: { error?: string; field?: string } } };
type Phase = "loading" | "form" | "done" | "declined" | "expired" | "decided" | "failed";
type Field = "guardianName" | "relationship" | "confirmMinorDetails" | "acceptTerms";

/**
 * auth.parental-consent rules 7–9 (PAD-198) — the page a guardian reaches from
 * the consent email. Web only, by design: an email link always opens a browser
 * (R-024 exception, recorded in the spec). Opening the page changes nothing;
 * consenting records the audit fields; "Não autorizo" removes the account after
 * a confirmation that says so plainly.
 */
const GuardianConsentPage = () => {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [phase, setPhase] = useState<Phase>("loading");
  const [request, setRequest] = useState<GuardianConsentRequest | null>(null);
  const [guardianName, setGuardianName] = useState("");
  const [relationship, setRelationship] = useState<GuardianConsentPayload["relationship"] | "">("");
  const [confirmMinor, setConfirmMinor] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  const fail = (err: unknown) => {
    const status = (err as ApiError).response?.status;
    setPhase(status === 410 ? "expired" : status === 409 ? "decided" : "failed");
  };

  useEffect(() => {
    let alive = true;
    getGuardianConsent(token)
      .then((data) => {
        if (!alive) return;
        setRequest(data);
        setPhase("form");
      })
      .catch((err) => alive && fail(err));
    return () => {
      alive = false;
    };
  }, [token]);

  const name = request?.minor.name ?? "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<Field, string>> = {};
    if (!guardianName.trim()) next.guardianName = t("auth.guardianConsent.nameRequired");
    if (!relationship) next.relationship = t("auth.guardianConsent.relationshipRequired");
    if (!confirmMinor) next.confirmMinorDetails = t("auth.guardianConsent.confirmRequired");
    if (!acceptTerms) next.acceptTerms = t("auth.guardianConsent.termsRequired");
    setErrors(next);
    if (Object.keys(next).length) return;
    setSubmitting(true);
    try {
      await giveGuardianConsent(token, {
        guardianName: guardianName.trim(),
        relationship: relationship as GuardianConsentPayload["relationship"],
        confirmMinorDetails: true,
        acceptTerms: true,
      });
      setPhase("done");
    } catch (err) {
      const res = (err as ApiError).response;
      if (res?.status === 400 && res.data?.field) {
        setErrors({ [res.data.field as Field]: t("auth.guardianConsent.failed") });
      } else {
        fail(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const decline = async () => {
    setSubmitting(true);
    try {
      await declineGuardianConsent(token);
      setPhase("declined");
    } catch (err) {
      fail(err);
    } finally {
      setSubmitting(false);
    }
  };

  const message = (testId: string, text: string) => (
    <p className="text-center text-sm" data-testid={testId}>
      {text}
    </p>
  );

  const birth = request?.minor.birthDate
    ? new Date(`${request.minor.birthDate}T00:00:00`).toLocaleDateString(i18n.language)
    : "—";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-lg" data-testid="guardian-consent">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold text-center">{t("auth.guardianConsent.title")}</CardTitle>
          {phase === "form" && request && (
            <CardDescription className="space-y-2 text-left">
              <span className="block">{t("auth.guardianConsent.intro", { name })}</span>
              <span className="block">{t("auth.guardianConsent.what", { name, version: request.termsVersion })}</span>
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          {phase === "loading" && message("guardian-consent-loading", t("auth.guardianConsent.loading"))}
          {phase === "expired" && message("consent-expired", t("auth.guardianConsent.expired"))}
          {phase === "decided" && message("consent-decided", t("auth.guardianConsent.decided"))}
          {phase === "failed" && message("consent-failed", t("auth.guardianConsent.failed"))}
          {phase === "done" && message("consent-done", t("auth.guardianConsent.done", { name }))}
          {phase === "declined" && message("consent-declined", t("auth.guardianConsent.declined", { name }))}

          {phase === "form" && request && (
            <form className="space-y-5" onSubmit={(e) => void submit(e)} noValidate>
              <div className="rounded-md border p-3" data-testid="consent-minor">
                <p className="mb-2 text-sm font-medium">{t("auth.guardianConsent.minorHeading", { name })}</p>
                <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{t("auth.guardianConsent.minorName")}</dt>
                  <dd>{request.minor.name}</dd>
                  <dt className="text-muted-foreground">{t("auth.guardianConsent.minorUsername")}</dt>
                  <dd>{request.minor.username}</dd>
                  <dt className="text-muted-foreground">{t("auth.guardianConsent.minorBirthDate")}</dt>
                  <dd>{birth}</dd>
                  <dt className="text-muted-foreground">{t("auth.guardianConsent.minorCountry")}</dt>
                  <dd>{request.minor.country ? countryName(request.minor.country, i18n.language) : "—"}</dd>
                </dl>
              </div>

              <div className="space-y-2">
                <Label htmlFor="consent-guardianName">{t("auth.guardianConsent.guardianName")}</Label>
                <Input
                  id="consent-guardianName"
                  autoComplete="name"
                  value={guardianName}
                  onChange={(e) => {
                    setGuardianName(e.target.value);
                    setErrors((p) => ({ ...p, guardianName: undefined }));
                  }}
                />
                {errors.guardianName && <p className="text-sm text-destructive">{errors.guardianName}</p>}
              </div>

              <div className="space-y-2">
                <Label>{t("auth.guardianConsent.relationship", { name })}</Label>
                <div className="flex gap-2" role="radiogroup">
                  {(["parent", "legal_guardian"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={relationship === value}
                      data-testid={`consent-relationship-${value}`}
                      onClick={() => {
                        setRelationship(value);
                        setErrors((p) => ({ ...p, relationship: undefined }));
                      }}
                      className={cn(
                        "flex-1 rounded-lg border p-3 text-sm transition-colors",
                        relationship === value ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
                      )}
                    >
                      {value === "parent"
                        ? t("auth.guardianConsent.relationshipParent")
                        : t("auth.guardianConsent.relationshipGuardian")}
                    </button>
                  ))}
                </div>
                {errors.relationship && <p className="text-sm text-destructive">{errors.relationship}</p>}
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={confirmMinor}
                    onCheckedChange={(v) => {
                      setConfirmMinor(v === true);
                      setErrors((p) => ({ ...p, confirmMinorDetails: undefined }));
                    }}
                    data-testid="consent-confirm-minor"
                  />
                  <span>{t("auth.guardianConsent.confirmMinor")}</span>
                </label>
                {errors.confirmMinorDetails && <p className="text-sm text-destructive">{errors.confirmMinorDetails}</p>}
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={acceptTerms}
                    onCheckedChange={(v) => {
                      setAcceptTerms(v === true);
                      setErrors((p) => ({ ...p, acceptTerms: undefined }));
                    }}
                    data-testid="consent-accept-terms"
                  />
                  <span>
                    {t("auth.guardianConsent.acceptTerms", { name })}{" "}
                    <Link to="/privacy" target="_blank" className="underline">
                      {t("auth.legal.privacyPolicy")}
                    </Link>{" "}
                    {t("auth.legal.separator")}{" "}
                    <Link to="/terms" target="_blank" className="underline">
                      {t("auth.legal.terms")}
                    </Link>
                  </span>
                </label>
                {errors.acceptTerms && <p className="text-sm text-destructive">{errors.acceptTerms}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={submitting} data-testid="consent-submit">
                {submitting ? t("auth.guardianConsent.submitting") : t("auth.guardianConsent.submit")}
              </Button>

              {confirmDecline ? (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3" data-testid="consent-decline-panel">
                  <p className="text-sm font-medium">{t("auth.guardianConsent.declineTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("auth.guardianConsent.declineBody", { name })}</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      disabled={submitting}
                      onClick={() => void decline()}
                      data-testid="consent-decline-confirm"
                    >
                      {t("auth.guardianConsent.declineConfirm")}
                    </Button>
                    <Button type="button" variant="outline" disabled={submitting} onClick={() => setConfirmDecline(false)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setConfirmDecline(true)}
                  data-testid="consent-decline"
                >
                  {t("auth.guardianConsent.decline")}
                </Button>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GuardianConsentPage;
