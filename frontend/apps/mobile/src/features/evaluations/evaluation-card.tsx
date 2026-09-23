import { competencyLabel, deltaPresentation } from "@levelup/config";
import type { EvaluationCard as EvaluationCardData, EvaluationShareEvolution } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import { formatEvaluationDate } from "./format-date";

interface EvaluationCardProps {
  card: EvaluationCardData;
}

const PERIOD_LABEL_KEY: Record<Exclude<EvaluationShareEvolution, "none">, string> = {
  last: "players.evaluationSharing.card.periodLast",
  "6m": "players.evaluationSharing.card.period6m",
  "1y": "players.evaluationSharing.card.period1y",
};

/**
 * `evaluations.sharing` rule 3 / `evaluations.student-view` rule 6 — ONE card
 * component renders both the coach's preview (step 2 of the share flow) and
 * the player's read (the dashboard block, `/evaluations`): the `Card` the
 * server sends, with no computation and no re-sorting (R-048). The only
 * client-side work is formatting — the date, the same way `HistoryCard` does
 * (`formatEvaluationDate`), and the evolution delta's sign/colour, the same
 * convention `EvolutionSection` uses (`deltaPresentation` from
 * `@levelup/config`: green only for "up", muted otherwise).
 */
export function EvaluationCard({ card }: EvaluationCardProps) {
  const { t, i18n } = useTranslation();

  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-4" testID={`evaluation-card-${card.recordId}`}>
      <View className="gap-0.5">
        <Text className="text-sm font-semibold">
          {formatEvaluationDate(card.evaluatedOn, i18n.language)}
          {card.className ? (
            <Text className="text-sm font-normal text-muted-foreground"> · {card.className}</Text>
          ) : null}
        </Text>
        {card.coachName ? (
          <Text className="text-xs text-muted-foreground">
            {t("players.evaluationSharing.card.from", { coach: card.coachName })}
          </Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        {card.ratings.map((rating) => (
          <View key={`${rating.key ?? ""}:${rating.name}`} className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-sm" numberOfLines={1}>{competencyLabel(t, rating)}</Text>
            <Text className="text-sm font-medium" testID={`evaluation-card-rating-${rating.name}`}>
              {t("players.evaluationHistory.stepperValue", { score: rating.score, max: rating.scaleMax })}
            </Text>
          </View>
        ))}
      </View>

      {card.evolution.length > 0 && card.evolutionPeriod !== "none" ? (
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            {t(PERIOD_LABEL_KEY[card.evolutionPeriod])}
          </Text>
          {card.evolution.map((line) => {
            // Only the sign/colour are derived here, never a new number — the
            // server already rounded `delta` (evaluations.sharing rule 5).
            const presentation = deltaPresentation({ value: line.delta, sinceMonth: "" });
            return (
              <View key={`${line.key ?? ""}:${line.name}`} className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm text-muted-foreground" numberOfLines={1}>{competencyLabel(t, line)}</Text>
                <Text
                  className={cn("text-sm font-medium", presentation?.trend === "up" ? "text-success" : "text-muted-foreground")}
                  testID={`evaluation-card-evolution-${line.name}`}
                >
                  {presentation?.text ?? "="}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {card.note ? (
        <View className="gap-0.5">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            {t("players.evaluationSharing.card.coachComment")}
          </Text>
          <Text className="text-sm italic text-muted-foreground">“{card.note}”</Text>
        </View>
      ) : null}
    </View>
  );
}
