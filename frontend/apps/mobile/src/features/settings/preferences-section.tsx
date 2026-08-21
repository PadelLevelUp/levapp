import { authApi } from "@levelup/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { CoachLevelsSection } from "@/features/settings/coach-levels-section";
import { EvaluationCategoriesSection } from "@/features/settings/evaluation-categories-section";
import i18n from "@/lib/i18n";

type Language = "pt" | "en";

const LANGUAGE_LABELS: Record<Language, string> = {
  pt: "Português",
  en: "English",
};

/**
 * Preferences, mirroring web's Preferences tab: the language preference, plus
 * the two coach-only editors web nests inside it (Coach Levels and Evaluation
 * Categories).
 *
 * Those two are gated INDIVIDUALLY on `isCoach` even though the enclosing
 * section is visible to players — web hit exactly this: a player opening
 * Preferences fired two 403s from editors they could not use. `isCoach` is
 * passed in rather than recomputed so the nav, the pane and these two share
 * one source of truth.
 *
 * Web also has a theme selector here. Mobile has no dark mode to select — a
 * repo-wide grep for `useColorScheme` / `colorScheme` / `darkTheme` across
 * apps/mobile/{src,app} returns 0 hits, and every screen reads `lightTheme`
 * from @levelup/config directly. A theme control would be a dead knob, so it
 * is omitted rather than faked.
 */
export function PreferencesSection({ isCoach }: { isCoach: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [language, setLanguage] = React.useState<Language>(
    user?.language ?? "pt"
  );
  // Holds the KEY, not the resolved string. `changeLanguage` is async, so
  // resolving here would freeze the message in the language being replaced —
  // switching to pt reported success in English.
  const [languageStatusKey, setLanguageStatusKey] = React.useState<
    string | null
  >(null);

  // Same key the Settings screen uses, so this is served from cache rather
  // than refetched — and it stays reactive when the screen's copy resolves.
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });
  React.useEffect(() => {
    if (me?.language) setLanguage(me.language);
  }, [me?.language]);

  const handleLanguageChange = async (value: Language) => {
    const previous = language;
    setLanguage(value);
    setLanguageStatusKey(null);
    try {
      const updated = await authApi.updateMe({ language: value });
      queryClient.setQueryData(["auth-me"], updated);
      void i18n.changeLanguage(value);
      setLanguageStatusKey("settings.mobile.languageSaved");
    } catch {
      setLanguage(previous);
      setLanguageStatusKey("settings.mobile.languageSaveFailed");
    }
  };

  return (
    <View className="gap-4">
      <Card testID="settings-preferences">
        <CardHeader>
          <CardTitle>{t("settings.preferences.title")}</CardTitle>
          <CardDescription>
            {t("settings.preferences.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-2">
          <Label>{t("settings.language")}</Label>
          <Select
            value={{ value: language, label: LANGUAGE_LABELS[language] }}
            onValueChange={(option) => {
              if (option && option.value !== language) {
                void handleLanguageChange(option.value as Language);
              }
            }}
          >
            <SelectTrigger
              testID="settings-language-select"
              accessibilityLabel={t("settings.language")}
            >
              <SelectValue placeholder={t("settings.language")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value="pt"
                label={LANGUAGE_LABELS.pt}
                testID="settings-language-pt"
                accessibilityLabel={t("settings.portuguese")}
              />
              <SelectItem
                value="en"
                label={LANGUAGE_LABELS.en}
                testID="settings-language-en"
                accessibilityLabel={t("settings.english")}
              />
            </SelectContent>
          </Select>
          {languageStatusKey ? (
            <Text
              testID="settings-language-status"
              className="text-sm text-muted-foreground"
            >
              {t(languageStatusKey)}
            </Text>
          ) : null}
        </CardContent>
      </Card>

      {isCoach ? <CoachLevelsSection /> : null}
      {isCoach ? <EvaluationCategoriesSection /> : null}
    </View>
  );
}
