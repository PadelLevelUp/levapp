import type { DashboardEvaluationsBlock } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { EvaluationCard } from "@/features/evaluations/evaluation-card";

import { go } from "./blocks";

/**
 * "Avaliações" on the student dashboard (`evaluations.student-view` rules 4-5):
 * up to 3 of the newest shared cards plus "Ver todas" → `/evaluations`. The
 * server already caps and gates this (the `evaluations` capability token,
 * omitted entirely when the player has no shared card), so `StudentDashboard`
 * only renders this when the block itself is present — `.slice(0, 3)` here is
 * a defensive mirror of that cap, never a re-decision of it.
 */
export function StudentEvaluationsBlock({ block }: { block: DashboardEvaluationsBlock }) {
  const { t } = useTranslation();
  const cards = block.data.cards.slice(0, 3);

  return (
    <View className="gap-2.5" testID="student-evaluations-block">
      <View className="flex-row items-center justify-between">
        <Text className="px-1 text-xs font-sans-semibold uppercase tracking-widest text-muted-foreground">
          {t("players.evaluationSharing.student.blockTitle")}
        </Text>
        <Pressable
          onPress={() => go(block.data.href)}
          accessibilityRole="button"
          testID="student-evaluations-see-all"
          className="px-1 py-2"
        >
          <Text className="text-[13px] font-sans-semibold text-primary">
            {t("players.evaluationSharing.student.seeAll")}
          </Text>
        </Pressable>
      </View>
      <View className="gap-2.5">
        {cards.map((card) => (
          <EvaluationCard key={card.recordId} card={card} />
        ))}
      </View>
    </View>
  );
}
