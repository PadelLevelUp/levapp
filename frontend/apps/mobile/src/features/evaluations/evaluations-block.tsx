/**
 * players.profile rule 10 (PAD-834): Block 2, Avaliações, on the player screen — the web twin is
 * `PlayerEvaluationsBlock.tsx`, with the same ids. The last evaluation (author, competencies on
 * their own scales, note, Editar only today) above Evolução once the link has
 * EVOLUTION_MIN_RECORDS records. "Histórico (N)" keeps the history screen's entry id
 * (`player-evaluations-open`); the date line keeps `evaluation-card-last`. Every figure is the
 * server's (R-048).
 */
import { Ionicons } from "@expo/vector-icons";
import { EVOLUTION_MIN_RECORDS, competencyLabel, isStarScale, lightTheme } from "@levelup/config";
import type { EvaluationCompetency, EvaluationRecord } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";

import { EvolutionSection } from "./evolution-section";
import { formatEvaluationDate } from "./format-date";
import { ScoreStepper } from "./score-stepper";
import { StarRating } from "./star-rating";

export function EvaluationsBlock({
  playerId,
  authorName,
  records,
  lastEvaluatedOn,
  competencies,
  competenciesWithData,
  loading,
  ready,
  onOpenHistory,
  onNew,
  onEdit,
}: {
  playerId: string;
  /** The signed-in coach's display name: records are per coach. */
  authorName: string;
  records: EvaluationRecord[];
  /** undefined while the read is in flight. */
  lastEvaluatedOn: string | null | undefined;
  competencies: EvaluationCompetency[];
  competenciesWithData: number[];
  loading: boolean;
  /** Both reads are in: the form may open. */
  ready: boolean;
  onOpenHistory: () => void;
  onNew: () => void;
  onEdit: (record: EvaluationRecord) => void;
}) {
  const { t, i18n } = useTranslation();
  const last = records[0];

  return (
    <Card testID="evaluation-card">
      <CardHeader className="gap-2">
        <CardTitle>{t("players.card.evaluationsTitle")}</CardTitle>
        <View className="flex-row flex-wrap gap-2">
          <Button variant="outline" size="sm" testID="player-evaluations-open"
            accessibilityLabel={t("players.card.historyCount", { count: records.length })} onPress={onOpenHistory}>
            <Ionicons name="time-outline" size={16} color={lightTheme.foreground} />
            <Text>{t("players.card.historyCount", { count: records.length })}</Text>
          </Button>
          <Button size="sm" testID="profile-evaluations-new" accessibilityLabel={t("players.evaluationHistory.new")}
            disabled={!ready} onPress={onNew}>
            <Ionicons name="add" size={16} color={lightTheme.primaryForeground} />
            <Text>{t("players.evaluationHistory.new")}</Text>
          </Button>
        </View>
      </CardHeader>
      <CardContent className="gap-4">
        <Text className="text-sm text-muted-foreground" testID="evaluation-card-last">
          {lastEvaluatedOn === undefined
            ? " "
            : lastEvaluatedOn === null
              ? t("players.evaluationHistory.none")
              : t("players.evaluationHistory.lastEvaluated", { date: formatEvaluationDate(lastEvaluatedOn, i18n.language) })}
        </Text>

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !last ? (
          <View className="items-start rounded-lg border border-dashed border-border p-3" testID="profile-evaluations-empty">
            <Button testID="profile-evaluations-first" accessibilityLabel={t("players.card.firstEvaluation")}
              disabled={!ready} onPress={onNew}>
              <Text>{t("players.card.firstEvaluation")}</Text>
            </Button>
          </View>
        ) : (
          <View className="gap-6">
            {/* Stacked on a phone: the left column (last evaluation) above the right (Evolução). */}
            <View className="gap-3" testID="profile-evaluation-last" accessibilityHint={String(last.id)}>
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold">{t("players.card.lastEvaluation")}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {formatEvaluationDate(last.evaluatedOn, i18n.language)}
                    {last.className ? ` · ${last.className}` : ""}
                  </Text>
                  {authorName ? (
                    <Text className="text-xs text-muted-foreground" testID="profile-evaluation-last-author" accessibilityHint={authorName}>
                      {t("players.card.by", { name: authorName })}
                    </Text>
                  ) : null}
                </View>
                {last.editable ? (
                  <Button variant="ghost" size="sm" testID="profile-evaluation-last-edit"
                    accessibilityLabel={t("players.evaluationHistory.edit")} onPress={() => onEdit(last)}>
                    <Ionicons name="pencil-outline" size={16} color={lightTheme.foreground} />
                    <Text>{t("players.evaluationHistory.edit")}</Text>
                  </Button>
                ) : null}
              </View>
              <View className="gap-1.5">
                {last.ratings.map((rating) => {
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
              {last.note ? (
                <Text className="text-sm italic text-muted-foreground" testID="profile-evaluation-last-note">“{last.note}”</Text>
              ) : null}
            </View>

            <View className="gap-3">
              <Text className="text-sm font-semibold">{t("players.evaluationHistory.evolution")}</Text>
              {records.length >= EVOLUTION_MIN_RECORDS ? (
                <View testID="evaluation-evolution">
                  <EvolutionSection playerId={playerId} competencies={competencies} competenciesWithData={competenciesWithData} />
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground" testID="profile-evolution-gate">
                  {t("players.card.evolutionGate")}
                </Text>
              )}
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
