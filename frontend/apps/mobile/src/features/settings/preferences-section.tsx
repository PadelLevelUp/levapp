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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { CoachLevelsSection } from "@/features/settings/coach-levels-section";
import { EvaluationSettingsGroup } from "@/features/evaluations/evaluation-settings-group";
import { useSectionSave } from "@/features/settings/unsaved-registry";
import { writeAuthMe } from "@/features/settings/write-auth-me";
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

  // Same key the Settings screen uses, so this is served from cache rather
  // than refetched — and it stays reactive when the screen's copy resolves.
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });

  // settings.explicit-save (PAD-506): language and request alerts are held until the screen's one
  // Save. `null` = no held change: the control shows what the server has (the cached profile).
  const storedLanguage = ((me?.language ?? user?.language ?? "pt") as Language);
  // PAD-232: request alerts opt-out (notifications.request-alerts rule 6). An explicit `false` is the only "off".
  const storedRequestAlerts = me?.requestAlerts !== false;
  const [languageDraft, setLanguageDraft] = React.useState<Language | null>(null);
  const [requestAlertsDraft, setRequestAlertsDraft] = React.useState<boolean | null>(null);
  const language = languageDraft ?? storedLanguage;
  const requestAlerts = requestAlertsDraft ?? storedRequestAlerts;
  // settings.unsaved-edits rule 2: by value — changing and changing back is clean.
  const unsaved = (languageDraft !== null && languageDraft !== storedLanguage) ||
    (requestAlertsDraft !== null && requestAlertsDraft !== storedRequestAlerts);

  // settings.explicit-save rule 3: this section's part of the one Save — one PATCH with what changed.
  useSectionSave("preferences", unsaved, {
    label: t("settings.preferences.title"),
    save: async () => {
      const payload: authApi.UpdateMePayload = {};
      if (languageDraft !== null && languageDraft !== storedLanguage) payload.language = languageDraft;
      if (requestAlertsDraft !== null && requestAlertsDraft !== storedRequestAlerts) payload.requestAlerts = requestAlertsDraft;
      if (Object.keys(payload).length === 0) return;
      const updated = await authApi.updateMe(payload);
      // B-185: the save's answer is the newest profile.
      await writeAuthMe(queryClient, updated);
      setLanguageDraft(null);
      setRequestAlertsDraft(null);
      // Rule 2: the app re-renders in the language once the server has it.
      if (payload.language) void i18n.changeLanguage((updated.language ?? payload.language) as Language);
    },
  });

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
              if (option) setLanguageDraft(option.value as Language);
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

          {/* PAD-232: for every role — a student is asked to link accounts, a
              coach hears about club join requests, an admin about approvals. */}
          <View className="mt-4 flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <Label>{t("settings.preferences.requestAlerts")}</Label>
              <Text className="text-xs text-muted-foreground">
                {t("settings.preferences.requestAlertsDescription")}
              </Text>
            </View>
            <Switch
              testID="settings-request-alerts"
              accessibilityLabel={t("settings.preferences.requestAlerts")}
              checked={requestAlerts}
              onCheckedChange={(checked) => setRequestAlertsDraft(checked)}
            />
          </View>
        </CardContent>
      </Card>

      {isCoach ? <CoachLevelsSection /> : null}
      {/* PAD-431: the evaluation settings under one "Avaliações" heading. */}
      {isCoach ? <EvaluationSettingsGroup /> : null}
    </View>
  );
}
