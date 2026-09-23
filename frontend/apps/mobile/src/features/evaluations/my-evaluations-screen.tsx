import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useMyEvaluations } from "@levelup/hooks";
import { useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";

import { EvaluationCard } from "./evaluation-card";

/**
 * "As minhas avaliações" on iOS (`evaluations.student-view` rule 4): a pushed
 * screen listing every card ever shared with the player, newest first — the
 * server's own order, never re-sorted here (rule 2). Empty and error states,
 * both without an unread-count side effect: a player cannot act on any of
 * this (rule 7).
 */
export function MyEvaluationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const myEvaluations = useMyEvaluations();
  const cards = myEvaluations.data?.cards ?? [];

  return (
    <Screen edges={["top"]} testID="student-evaluations-page">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" testID="student-evaluations-back"
          accessibilityLabel={t("players.evaluationHistory.close")} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
        </Button>
        <Text role="heading" aria-level={1} className="flex-1 text-xl font-bold" numberOfLines={1}>
          {t("players.evaluationSharing.student.pageTitle")}
        </Text>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-4 pb-12">
        {myEvaluations.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {myEvaluations.isError ? (
          <ErrorState
            message={t("players.evaluationSharing.student.loadError")}
            onRetry={() => void myEvaluations.refetch()}
          />
        ) : null}
        {!myEvaluations.isLoading && !myEvaluations.isError && cards.length === 0 ? (
          <Text className="text-sm text-muted-foreground" testID="student-evaluations-empty">
            {t("players.evaluationSharing.student.empty")}
          </Text>
        ) : null}
        {cards.map((card) => (
          <EvaluationCard key={card.recordId} card={card} />
        ))}
      </ScrollView>
    </Screen>
  );
}
