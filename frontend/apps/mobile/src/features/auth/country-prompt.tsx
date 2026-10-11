import { COUNTRIES, countryName, countryPromptDismissal, lightTheme, shouldAskCountry } from "@levelup/config";
import { authApi } from "@levelup/api";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { postLoginRoute } from "@/auth/postLoginRoute";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { loadCountryPromptStorage } from "@/lib/country-prompt-storage";

/**
 * PAD-630 (auth.login rule 13): an account with no country is asked once after sign-in, as on web.
 * The countries are a plain list inside the dialog, not a Select: a Select inside a Dialog is
 * unreachable on iOS (B-295, see waiting-list-dialog.tsx). PT is preselected; "Guardar" sends
 * `PATCH /auth/me {country}` and refreshes the session; "Agora não" hides it on the device for
 * 30 days. Never a hold.
 */
export function CountryPrompt() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  // The dismissal over the device's store; null until the store has been read, so the prompt
  // never flashes for a user who already said "Agora não".
  const [dismissal, setDismissal] = React.useState<ReturnType<typeof countryPromptDismissal> | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [country, setCountry] = React.useState("PT");
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void loadCountryPromptStorage().then((storage) => {
      if (!alive) return;
      const d = countryPromptDismissal(storage);
      setDismissal(d);
      setDismissed(d.isDismissed());
    });
    return () => {
      alive = false;
    };
  }, []);

  // Held on the email-code screen or as a pending coach: the same holds the tabs guard applies.
  const gated = postLoginRoute(user) !== "/(tabs)/dashboard";
  if (!dismissal || !shouldAskCountry(user, { dismissed, gated })) return null;

  const later = () => {
    dismissal.dismiss();
    setDismissed(true);
  };

  const save = async () => {
    setSaving(true);
    setFailed(false);
    try {
      await authApi.updateMe({ country });
      await refreshUser();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && later()}>
      <DialogContent testID="country-prompt">
        <DialogHeader>
          <DialogTitle>{t("auth.countryPrompt.title")}</DialogTitle>
          <DialogDescription>{t("auth.countryPrompt.body")}</DialogDescription>
        </DialogHeader>
        <ScrollView testID="country-prompt-select" style={{ maxHeight: 280 }}>
          {COUNTRIES.map((c) => {
            const chosen = country === c.code;
            return (
              <Pressable
                key={c.code}
                testID={`country-prompt-option-${c.code}`}
                role="radio"
                accessibilityState={{ selected: chosen }}
                onPress={() => setCountry(c.code)}
                className="rounded-md px-3 py-3"
                style={{ backgroundColor: chosen ? lightTheme.primary : "transparent" }}
              >
                <Text style={{ color: chosen ? lightTheme.primaryForeground : lightTheme.foreground }}>
                  {countryName(c.code, i18n.language)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {failed ? (
          <Text className="text-sm text-destructive" testID="country-prompt-error">
            {t("auth.countryPrompt.error")}
          </Text>
        ) : null}
        <DialogFooter>
          <Button testID="country-prompt-save" disabled={saving} onPress={save}>
            <Text>{t("auth.countryPrompt.save")}</Text>
          </Button>
          <Button testID="country-prompt-later" variant="ghost" disabled={saving} onPress={later}>
            <Text>{t("auth.countryPrompt.later")}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
