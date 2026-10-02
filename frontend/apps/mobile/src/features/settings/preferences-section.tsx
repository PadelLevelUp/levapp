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
import { AUTH_ME_KEY, writeAuthMe } from "@/features/settings/write-auth-me";
import { SaveSign, useSaveSign } from "@/features/settings/save-sign";
import { SaveLedger, createSerialSaver } from "@levelup/config";
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
  // settings.save-on-change (PAD-473): language and request alerts sign their saves. What they show
  // after a failure comes from the shared SaveLedger (rule 3), seeded from the cached profile — which
  // never replaces a field a save has touched. Both controls display the cache, so every rollback is a
  // cache write.
  const sign = useSaveSign();
  const ledger = React.useRef<SaveLedger<{ language: Language; requestAlerts: boolean }> | null>(null);
  if (!ledger.current) ledger.current = new SaveLedger();
  // settings.save-on-change rule 3: one save of this field in flight at a time, the latest pending
  // value sent next, so the server ends in the order the saves were sent.
  const [saveLanguage] = React.useState(() => createSerialSaver((value: Language) => authApi.updateMe({ language: value })));
  const [saveRequestAlerts] = React.useState(() => createSerialSaver((on: boolean) => authApi.updateMe({ requestAlerts: on })));

  // Same key the Settings screen uses, so this is served from cache rather
  // than refetched — and it stays reactive when the screen's copy resolves.
  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });
  React.useEffect(() => {
    if (me?.language) setLanguage(me.language);
  }, [me?.language]);
  React.useEffect(() => {
    if (!me) return;
    ledger.current!.seed({
      ...(me.language ? { language: me.language as Language } : {}),
      requestAlerts: me.requestAlerts !== false,
    });
  }, [me]);

  // PAD-232: request alerts opt-out (notifications.request-alerts rule 6).
  // Server value wins; an explicit `false` is the only "off".
  const requestAlerts = me?.requestAlerts !== false;
  type Me = NonNullable<typeof me>;
  type Shown = Partial<{ language: Language; requestAlerts: boolean }>;

  const handleRequestAlertsChange = async (checked: boolean) => {
    const token = ledger.current!.begin({ requestAlerts: checked });
    // B-185 (C's #430 review): an in-flight read landing mid-save would flicker the toggle back.
    await queryClient.cancelQueries({ queryKey: AUTH_ME_KEY });
    queryClient.setQueryData(["auth-me"], (cur: typeof me) =>
      cur ? { ...cur, requestAlerts: checked } : cur
    );
    await sign.track("requestAlerts", saveRequestAlerts(checked)).then(
      (answer) => writeAnswer(answer, ledger.current!.confirm(token, { requestAlerts: answer.requestAlerts !== false }).show),
      () => showInCache(ledger.current!.fail(token)),
    );
  };

  const handleLanguageChange = async (value: Language) => {
    const token = ledger.current!.begin({ language: value });
    setLanguage(value);
    await queryClient.cancelQueries({ queryKey: AUTH_ME_KEY });
    queryClient.setQueryData(["auth-me"], (cur: typeof me) => (cur ? { ...cur, language: value } : cur));
    await sign.track("language", saveLanguage(value)).then(
      async (answer) => {
        const { advanced, show } = ledger.current!.confirm(token, { language: (answer.language ?? value) as Language });
        await writeAnswer(answer, show);
        if (show.language) setLanguage(show.language);
        const applied = show.language ?? (advanced.language === language ? advanced.language : undefined);
        void i18n.changeLanguage(applied ?? value);
      },
      () => showInCache(ledger.current!.fail(token)),
    );
  };

  // The save's answer is the newest profile (B-185, writeAuthMe), except for the two save-on-change
  // fields: they keep what the screen shows — a newer save's value — unless the ledger says otherwise.
  const writeAnswer = async (answer: Me, show: Shown) => {
    const cur = queryClient.getQueryData<Me>(AUTH_ME_KEY);
    const updated = {
      ...answer,
      ...(cur ? { language: cur.language, requestAlerts: cur.requestAlerts } : {}),
      ...show,
    };
    await writeAuthMe(queryClient, updated);
  };
  const showInCache = (show: Shown) => {
    if (Object.keys(show).length === 0) return;
    queryClient.setQueryData(AUTH_ME_KEY, (cur: typeof me) => (cur ? { ...cur, ...show } : cur));
    // The select also holds the language locally; a rollback batched with the optimistic write
    // leaves the cached language unchanged between renders, so its effect would not fire.
    if (show.language) setLanguage(show.language);
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
          <SaveSign status={sign.status("language")} testID="settings-language-sign" textTestID="settings-language-status" />

          {/* PAD-232: for every role — a student is asked to link accounts, a
              coach hears about club join requests, an admin about approvals. */}
          <View className="mt-4 flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-0.5">
              <View className="flex-row items-center gap-2">
                <Label>{t("settings.preferences.requestAlerts")}</Label>
                <SaveSign status={sign.status("requestAlerts")} testID="settings-request-alerts-sign" />
              </View>
              <Text className="text-xs text-muted-foreground">
                {t("settings.preferences.requestAlertsDescription")}
              </Text>
            </View>
            <Switch
              testID="settings-request-alerts"
              accessibilityLabel={t("settings.preferences.requestAlerts")}
              checked={requestAlerts}
              onCheckedChange={(checked) => void handleRequestAlertsChange(checked)}
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
