import { Ionicons } from "@expo/vector-icons";
import { isStarCompetency, lightTheme, todaysClasslessRecord } from "@levelup/config";
import {
  useDeleteEvaluationRecord,
  useEvaluationCompetencies,
  usePlayerEvaluations,
  usePutEvaluationRecord,
} from "@levelup/hooks";
import type { EvaluationRecord } from "@levelup/types";
import { useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";

import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

import { EvaluationForm } from "./evaluation-form";
import { EvolutionSection } from "./evolution-section";
import { formatEvaluationDate } from "./format-date";
import { HistoryCard } from "./history-card";
import { openCompetencyManager } from "./open-competency-manager";

/** `"new"` = today's class-less record (or none yet); a record = that record, with its class. */
type FormTarget = "new" | EvaluationRecord | null;

interface PlayerEvaluationsScreenProps {
  playerId: string;
  playerName: string;
}

/**
 * "Avaliações — {nome}" on iOS (evaluations.history rule 3): a PUSHED screen, not
 * a native Modal sheet. Two sections — "Evolução" (`EvolutionSection`, PAD-375) and
 * "Histórico" — with the form inline above the cards, exactly as web's drawer. The
 * screen is a route, so its state dies with it (rule 10): another player gets a
 * fresh screen.
 */
export function PlayerEvaluationsScreen({ playerId, playerName }: PlayerEvaluationsScreenProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const history = usePlayerEvaluations(playerId);
  const competencySet = useEvaluationCompetencies();
  const put = usePutEvaluationRecord(playerId);
  const remove = useDeleteEvaluationRecord(playerId);

  const [target, setTarget] = React.useState<FormTarget>(null);
  const [deleting, setDeleting] = React.useState<EvaluationRecord | null>(null);

  const records = history.data?.records ?? [];
  const competencies = competencySet.data?.competencies ?? [];
  const starIds = React.useMemo(
    () => new Set(competencies.filter(isStarCompetency).map((competency) => competency.id)),
    [competencies]
  );
  // A rating whose competency was deleted is not in the set; its catalogue key still says it was a star one.
  const isStars = (categoryId: number) =>
    starIds.has(categoryId) ||
    (!competencies.some((c) => c.id === categoryId) &&
      records.some((r) => r.ratings.some((x) => x.categoryId === categoryId && x.key !== null)));

  const formRecord = target === "new" ? todaysClasslessRecord(records) : target;
  const classRef =
    target && target !== "new" && target.classInstanceId !== null
      ? { model: "LessonInstance", id: target.classInstanceId }
      : undefined;

  const confirmDelete = async () => {
    if (!deleting) return;
    const date = formatEvaluationDate(deleting.evaluatedOn, i18n.language);
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(t("players.evaluationHistory.deleted", { date }));
      if (target && target !== "new" && target.id === deleting.id) setTarget(null);
    } catch {
      toast.error(t("players.evaluationHistory.deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Screen edges={["top"]} testID="player-evaluations">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" testID="player-evaluations-back"
          accessibilityLabel={t("players.evaluationHistory.close")} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
        </Button>
        <Text role="heading" aria-level={1} className="flex-1 text-xl font-bold" numberOfLines={1}>
          {t("players.evaluationHistory.title", { name: playerName })}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={keyboardAvoidingBehavior()} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-8 p-4 pb-12">
          <View className="gap-3" testID="evaluation-evolution">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              {t("players.evaluationHistory.evolution")}
            </Text>
            <EvolutionSection
              playerId={playerId}
              competencies={competencies}
              competenciesWithData={history.data?.competenciesWithData ?? []}
              held={target !== null}
            />
          </View>

          <View className="gap-3" testID="evaluation-history">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                {t("players.evaluationHistory.history")}
              </Text>
              {target === null ? (
                // Not before BOTH reads are in: tapped early, the form showed the zero-competency
                // state falsely, or opened blank over today's record and a typed note replaced it.
                <Button variant="outline" size="sm" onPress={() => setTarget("new")} testID="evaluation-new"
                  disabled={!history.data || !competencySet.data}>
                  <Ionicons name="add" size={16} color={lightTheme.foreground} />
                  <Text>{t("players.evaluationHistory.new")}</Text>
                </Button>
              ) : null}
            </View>

            {target !== null ? (
              <EvaluationForm
                key={target === "new" ? "new" : target.id}
                competencies={competencies}
                record={formRecord}
                onSave={(input) => put.mutateAsync(classRef ? { ...input, classRef } : input)}
                onClose={() => setTarget(null)}
                onManageCompetencies={() => openCompetencyManager(router)}
              />
            ) : null}

            {history.isLoading ? <Skeleton className="h-24 w-full" /> : null}
            {history.isError ? (
              <ErrorState message={t("players.evaluationHistory.loadFailed")} onRetry={() => void history.refetch()} />
            ) : null}
            {!history.isLoading && !history.isError && records.length === 0 ? (
              <Text className="text-sm text-muted-foreground" testID="evaluation-history-empty">
                {t("players.evaluationHistory.historyEmpty")}
              </Text>
            ) : null}
            {records.map((record) => (
              <HistoryCard
                key={record.id}
                record={record}
                isStars={isStars}
                playerId={playerId}
                playerName={playerName}
                onEdit={() => setTarget(record)}
                onDelete={() => setDeleting(record)}
              />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertDialog open={deleting !== null} onOpenChange={(next) => { if (!next) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle testID="evaluation-delete-title">
              {deleting
                ? t("players.evaluationHistory.deleteTitle", { date: formatEvaluationDate(deleting.evaluatedOn, i18n.language) })
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("players.evaluationHistory.deleteDescription")}</AlertDialogDescription>
            {deleting?.share ? (
              <Text testID="evaluation-delete-shared-warning" className="text-sm text-destructive">
                {t("players.evaluationSharing.share.deleteSharedWarning")}
              </Text>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel><Text>{t("common.cancel")}</Text></AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onPress={() => void confirmDelete()} testID="evaluation-delete-confirm">
              <Text>{t("players.evaluationHistory.deleteConfirm")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
