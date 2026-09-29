import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";
import { CompetenciesSettingsEntry } from "./competency-manager/CompetenciesSettingsEntry";
import { EvaluationReminderSetting } from "./EvaluationReminderSetting";
import { EvaluationScaleSetting } from "./EvaluationScaleSetting";

/**
 * Settings → Preferences, coach-only (settings.role-scope rule 3, PAD-431): the evaluation
 * settings together under one "Avaliações" heading — the categories, how often to evaluate, and
 * the scale, in that order.
 */
export function EvaluationSettingsGroup() {
  const { t } = useTranslation();
  return (
    <section data-testid="settings-evaluations" aria-labelledby="settings-evaluations-title" className="space-y-4">
      <h2 id="settings-evaluations-title" data-testid="settings-evaluations-title" className="text-base font-semibold">
        {t("evaluations.settingsGroupTitle")}
      </h2>
      <CompetenciesSettingsEntry />
      <Separator />
      <EvaluationReminderSetting />
      <Separator />
      <EvaluationScaleSetting />
    </section>
  );
}
