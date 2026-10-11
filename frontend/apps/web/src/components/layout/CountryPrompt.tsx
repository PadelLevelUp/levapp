import { useState } from "react";
import { useTranslation } from "react-i18next";
import { COUNTRIES, countryName, countryPromptDismissal, shouldAskCountry } from "@levelup/config";
import { useAuth } from "@/auth/AuthContext";
import { postLoginPath } from "@/auth/postLoginPath";
import { updateMe } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * PAD-630 (auth.login rule 13): an account with no country is asked once after sign-in. PT is
 * preselected; "Guardar" sends `PATCH /auth/me {country}` and refreshes the session so the prompt
 * is gone for good; "Agora não" hides it on this device for 30 days. Never a hold: it is a dialog
 * the user can dismiss, and it stays out of the way of the email-code and coach-pending screens.
 */
export function CountryPrompt() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [dismissal] = useState(() =>
    countryPromptDismissal(typeof window === "undefined" ? null : window.localStorage)
  );
  const [dismissed, setDismissed] = useState(() => dismissal.isDismissed());
  const [country, setCountry] = useState("PT");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Held on the email-code screen or as a pending coach: the same holds the route guard applies.
  const gated = postLoginPath(user) !== "/dashboard";
  if (!shouldAskCountry(user, { dismissed, gated })) return null;

  const later = () => {
    dismissal.dismiss();
    setDismissed(true);
  };

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await updateMe({ country });
      await refreshUser();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && later()}>
      <DialogContent data-testid="country-prompt">
        <DialogHeader>
          <DialogTitle>{t("auth.countryPrompt.title")}</DialogTitle>
          <DialogDescription>{t("auth.countryPrompt.body")}</DialogDescription>
        </DialogHeader>
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger data-testid="country-prompt-select" aria-label={t("auth.countryPrompt.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {countryName(c.code, i18n.language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {failed && (
          <p className="text-sm text-destructive" role="alert" data-testid="country-prompt-error">
            {t("auth.countryPrompt.error")}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={later} disabled={saving} data-testid="country-prompt-later">
            {t("auth.countryPrompt.later")}
          </Button>
          <Button onClick={save} disabled={saving} data-testid="country-prompt-save">
            {t("auth.countryPrompt.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
