import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

import { CompetenciesSettingsEntry } from "./competency-manager/competencies-settings-entry";
import { EvaluationReminderSetting } from "./evaluation-reminder-setting";
import { EvaluationScaleSetting } from "./evaluation-scale-setting";

/**
 * Settings → Preferences, coach-only (settings.role-scope rule 3, PAD-431) — the twin of web's
 * `EvaluationSettingsGroup`: the evaluation settings under one "Avaliações" heading, in order the
 * categories, how often to evaluate, and the scale.
 */
export function EvaluationSettingsGroup() {
  const { t } = useTranslation();
  return (
    <View testID="settings-evaluations" className="gap-3">
      <Text testID="settings-evaluations-title" role="heading" aria-level={2} className="text-lg font-semibold">
        {t("evaluations.settingsGroupTitle")}
      </Text>
      <CompetenciesSettingsEntry />
      <EvaluationReminderSetting />
      <EvaluationScaleSetting />
    </View>
  );
}
