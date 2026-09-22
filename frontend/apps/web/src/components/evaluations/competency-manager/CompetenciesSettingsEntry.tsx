import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { openCompetencyManager } from "@/components/evaluations/openCompetencyManager";

/**
 * Settings → Preferences (evaluations.competencies rule 11): where the category editor
 * used to be. It holds no list of its own — the one manager is the same screen the
 * evaluation panels open.
 */
export function CompetenciesSettingsEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="space-y-3" data-testid="settings-competencies">
      <div>
        <h3 className="text-sm font-medium">{t("evaluations.manager.settingsTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("evaluations.manager.settingsDescription")}</p>
      </div>
      <Button variant="outline" data-testid="settings-competencies-open" onClick={() => openCompetencyManager(navigate)}>
        {t("evaluations.manager.open")}
      </Button>
    </div>
  );
}
