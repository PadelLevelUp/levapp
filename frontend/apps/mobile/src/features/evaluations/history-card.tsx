import { Ionicons } from "@expo/vector-icons";
import { competencyLabel, isStarScale, lightTheme } from "@levelup/config";
import type { EvaluationRecord } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { formatEvaluationDate } from "./format-date";
import { ScoreStepper } from "./score-stepper";
import { StarRating } from "./star-rating";

interface HistoryCardProps {
  record: EvaluationRecord;
  /** Both absent = a read-only card (the class panel's earlier-day record, PAD-376): no actions at all. */
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * One card per record (evaluations.history rules 6-8), as on web: the date and
 * "· {aula}" only when the record has a class; a read-only control per rated
 * competency on its own scale, switched-off ones included; the note in italics and
 * quotes. "Edit" only while the server says `editable`; "delete" always. No share
 * control — that is slice 7.
 */
export function HistoryCard({ record, onEdit, onDelete }: HistoryCardProps) {
  const { t, i18n } = useTranslation();
  const id = record.id;
  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-4" testID={`evaluation-history-card-${id}`}>
      <View className="flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-sm font-semibold">
          {formatEvaluationDate(record.evaluatedOn, i18n.language)}
          {record.className ? (
            <Text className="text-sm font-normal text-muted-foreground" testID="evaluation-history-class"> · {record.className}</Text>
          ) : null}
        </Text>
        <View className="flex-row">
          {record.editable && onEdit ? (
            <Button variant="ghost" size="icon" onPress={onEdit} testID={`evaluation-history-edit-${id}`}
              accessibilityLabel={t("players.evaluationHistory.edit")}>
              <Ionicons name="pencil-outline" size={18} color={lightTheme.foreground} />
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="ghost" size="icon" onPress={onDelete} testID={`evaluation-history-delete-${id}`}
              accessibilityLabel={t("players.evaluationHistory.delete")}>
              <Ionicons name="trash-outline" size={18} color={lightTheme.destructive} />
            </Button>
          ) : null}
        </View>
      </View>

      <View className="gap-1.5">
        {record.ratings.map((rating) => {
          const name = competencyLabel(t, rating);
          return (
            <View key={rating.categoryId} className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-sm" numberOfLines={1}>{name}</Text>
              {isStarScale(rating) ? (
                <StarRating id={rating.categoryId} name={name} score={rating.score} max={rating.scaleMax} size="sm" />
              ) : (
                <ScoreStepper id={rating.categoryId} name={name} score={rating.score} scaleMin={rating.scaleMin} scaleMax={rating.scaleMax} />
              )}
            </View>
          );
        })}
      </View>

      {record.note ? (
        <Text className="text-sm italic text-muted-foreground" testID="evaluation-history-note">“{record.note}”</Text>
      ) : null}
      {!record.editable ? (
        <Text className="text-xs text-muted-foreground">{t("players.evaluationHistory.readOnlyHint")}</Text>
      ) : null}
    </View>
  );
}
