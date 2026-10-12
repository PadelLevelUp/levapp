import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { isUnderSignupAge, legalCatchUpParts, legalCatchUpSession } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TermsAcceptField } from "@/components/auth/TermsAcceptField";
import { acceptLegal } from "@/api/auth";
import { useAuth } from "@/auth/AuthContext";
import { postLoginLanding } from "@/auth/postLoginPath";

/** auth.register rule 18's codes, in this screen's words. */
const BIRTH_DATE_KEYS: Record<string, string> = {
  BIRTH_DATE_REQUIRED: "birthDateRequired",
  INVALID_BIRTH_DATE: "birthDateRequired",
  UNDERAGE: "underage",
};

/**
 * PAD-637 (auth.legal-catch-up): an account completed before the Terms were recorded on every path, or
 * created before the birth-date rule, is asked once per session for what is missing. "Agora não" skips
 * for the session (rule 4); an under-18 date is refused and saves nothing (rule 5).
 */
export default function LegalCatchUpPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const parts = legalCatchUpParts(user);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [errors, setErrors] = useState<{ terms?: string; birthDate?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  // Nothing pending (a direct visit, or another tab already saved): carry on.
  if (!parts.terms && !parts.birthDate) return <Navigate to={postLoginLanding(user)} replace />;

  const moveOn = (me: typeof user) => navigate(postLoginLanding(me), { replace: true });

  const notNow = () => {
    if (user?.id != null) legalCatchUpSession.skip(user.id);
    moveOn(user);
  };

  const save = async () => {
    const next: typeof errors = {};
    if (parts.terms && !termsAccepted) next.terms = t("auth.legal.termsRequiredToContinue");
    if (parts.birthDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) next.birthDate = t("auth.legalCatchUp.birthDateRequired");
      else if (isUnderSignupAge(birthDate)) next.birthDate = t("auth.legalCatchUp.underage");
    }
    setErrors(next);
    if (next.terms || next.birthDate) return;

    setSaving(true);
    try {
      await acceptLegal({
        ...(parts.terms ? { termsAccepted: true } : {}),
        ...(parts.birthDate ? { birthDate } : {}),
      });
      moveOn((await refreshUser()) ?? user);
    } catch (error: unknown) {
      const data = (error as { response?: { status?: number; data?: { field?: string; code?: string } } })?.response?.data;
      if (data?.field === "terms") setErrors({ terms: t("auth.legal.termsRequiredToContinue") });
      else if (data?.field === "birthDate") {
        setErrors({ birthDate: t(`auth.legalCatchUp.${BIRTH_DATE_KEYS[data.code ?? ""] ?? "birthDateRequired"}`) });
      } else setErrors({ form: t("auth.legalCatchUp.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="legal-catch-up">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.legalCatchUp.title")}</CardTitle>
          <CardDescription>{t("auth.legalCatchUp.intro")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {parts.birthDate && (
            <div className="space-y-2">
              <Label htmlFor="legalCatchUp-birthDate">{t("auth.legalCatchUp.birthDateLabel")}</Label>
              <Input
                id="legalCatchUp-birthDate"
                data-testid="legalCatchUp-birthDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={birthDate}
                aria-invalid={errors.birthDate ? true : undefined}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  setErrors((prev) => ({ ...prev, birthDate: undefined }));
                }}
              />
              <p className="text-xs text-muted-foreground">{t("auth.legalCatchUp.birthDateHint")}</p>
              {errors.birthDate && (
                <p className="text-sm text-destructive" data-testid="legalCatchUp-birthDate-error">
                  {errors.birthDate}
                </p>
              )}
            </div>
          )}

          {parts.terms && (
            <TermsAcceptField
              id="legalCatchUp-terms"
              checked={termsAccepted}
              onCheckedChange={(next) => {
                setTermsAccepted(next);
                setErrors((prev) => ({ ...prev, terms: undefined }));
              }}
              error={errors.terms}
            />
          )}

          {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

          <div className="space-y-2">
            <Button className="w-full" onClick={save} disabled={saving} data-testid="legalCatchUp-save">
              {t("auth.legalCatchUp.save")}
            </Button>
            <Button variant="ghost" className="w-full" onClick={notNow} disabled={saving} data-testid="legalCatchUp-notNow">
              {t("auth.legalCatchUp.notNow")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
