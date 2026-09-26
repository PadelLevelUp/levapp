import type { CategorySection } from "@levelup/config";
import type { EvaluationCompetency } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

import { AddCustomCompetency } from "./add-custom-competency";
import { CompetencyRow, managerRowId } from "./competency-row";

/**
 * One section of "Definir categorias de avaliação" on iOS (PAD-431, evaluations.competencies
 * rule 15) — the twin of web's `ManagerSectionView`, the same test ids: the coach's legacy
 * categories, or one category heading its sub-categories, with a field to add one when the
 * category is a row the coach holds.
 */
export function CategorySectionView({ section, onDelete }: { section: CategorySection; onDelete: (c: EvaluationCompetency) => void }) {
  const { t } = useTranslation();
  if (section.kind === "legacy") {
    return (
      <View testID="competency-section-legacy" className="gap-1">
        <Text testID="competency-group-legacy" role="heading" aria-level={2}
          className="text-xs font-semibold uppercase text-muted-foreground">
          {t("evaluations.manager.legacyTitle")}
        </Text>
        <Text testID="competency-group-legacy-caption" className="text-xs text-muted-foreground">
          {t("evaluations.manager.legacyCaption")}
        </Text>
        {section.subs.map((row) => <CompetencyRow key={managerRowId(row)} row={row} onDelete={onDelete} />)}
      </View>
    );
  }
  return (
    <View testID={`competency-section-${section.id}`} className="gap-1 rounded-md border border-border px-3">
      {section.head ? (
        <CompetencyRow row={section.head} onDelete={onDelete} level="category" />
      ) : (
        // A default the coach cannot be offered (they hold its name): its sub-categories still are.
        <Text testID={`competency-category-title-${section.id}`} className="py-3 text-base font-semibold">
          {t(`evaluations.catalogue.${section.headKey}`)}
        </Text>
      )}
      {section.subs.map((row) => (
        <CompetencyRow key={managerRowId(row)} row={row} onDelete={onDelete} level="sub" />
      ))}
      {section.parentId !== null ? (
        <View className="py-2">
          <AddCustomCompetency parentId={section.parentId} sectionId={section.id} />
        </View>
      ) : null}
    </View>
  );
}
