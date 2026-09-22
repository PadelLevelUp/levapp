import { useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { openCompetencyManager } from "@/features/evaluations/open-competency-manager";

/**
 * Settings → Preferences (evaluations.competencies rule 11): where the category editor
 * used to be. It holds no list of its own — the one manager is the same screen the
 * evaluation surfaces open.
 */
export function CompetenciesSettingsEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Card testID="settings-competencies">
      <CardHeader>
        <CardTitle>{t("evaluations.manager.settingsTitle")}</CardTitle>
        <CardDescription>{t("evaluations.manager.settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" testID="settings-competencies-open" onPress={() => openCompetencyManager(router)}>
          <Text>{t("evaluations.manager.open")}</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
