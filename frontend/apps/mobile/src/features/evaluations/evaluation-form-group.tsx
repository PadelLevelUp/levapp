import { competencyLabel, type FormGroup } from "@levelup/config";
import type { EvaluationCompetency } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

/**
 * One group of the entry form (PAD-431, evaluations.competencies rule 15, D7): a category heading
 * the sub-categories offered under it, or rows scored directly with no heading (`formGroups`).
 */
export function EvaluationFormGroupView({ group, renderRow }: { group: FormGroup; renderRow: (row: EvaluationCompetency) => React.ReactNode }) {
  const { t } = useTranslation();
  if (!group.category) return <>{group.rows.map(renderRow)}</>;
  return (
    <View testID={`evaluation-group-${group.category.id}`} className="gap-3">
      <Text testID={`evaluation-group-title-${group.category.id}`} className="text-xs font-semibold uppercase text-muted-foreground">
        {competencyLabel(t, group.category)}
      </Text>
      <View className="gap-4 pl-3">{group.rows.map(renderRow)}</View>
    </View>
  );
}
