import { Ionicons } from "@expo/vector-icons";
import { competencyLabel, isStarScale, lightTheme } from "@levelup/config";
import { useShareEvaluation, useUnshareEvaluation } from "@levelup/hooks";
import type { EvaluationRecord } from "@levelup/types";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

import { formatEvaluationDate } from "./format-date";
import { ScoreStepper } from "./score-stepper";
import { StarRating } from "./star-rating";

interface HistoryCardProps {
  record: EvaluationRecord;
  /**
   * Who the record belongs to (`evaluations.sharing`): the share flow's own addressing
   * and cache key. Omitted (the class panel's earlier-day card), the card has no
   * sharing controls — as on web, where only the player drawer's card shares.
   */
  playerId?: string;
  playerName?: string;
  /** Both absent = a read-only card (the class panel's earlier-day record, PAD-376): no actions at all. */
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * One card per record (evaluations.history rules 6-8), as on web: the date and
 * "· {aula}" only when the record has a class; a read-only control per rated
 * competency on its own scale, switched-off ones included; the note in italics and
 * quotes. "Edit" only while the server says `editable`; "delete" always.
 *
 * The share control (`evaluations.sharing` decision 8) is a THIRD icon button, always
 * rendered — any record can be shared (rule 10), so the action row's width never
 * changes with state. Its one status line below ("✓ Partilhada…" with the
 * unshare/update actions inline) reserves its height whether or not the record is
 * shared or stale, so toggling it never shifts a card below it in the list (`nothing-moves-under-the-finger`).
 */
export function HistoryCard({ record, playerId, playerName, onEdit, onDelete }: HistoryCardProps) {
  const { t, i18n } = useTranslation();
  const id = record.id;
  const canShare = Boolean(playerId && playerName);
  const share = useShareEvaluation(playerId ?? "");
  const unshare = useUnshareEvaluation(playerId ?? "");
  const busy = share.isPending || unshare.isPending;

  const openShareFlow = () =>
    router.push({
      pathname: "/share-evaluation",
      params: { recordId: String(id), playerId, playerName },
    } as never);

  // Rule 7's "Atualizar partilha": the SAME POST again, with the selection already
  // stored on the record — no new choose-step, no new message.
  const handleUpdateShare = () => {
    if (!record.share) return;
    share.mutate(
      {
        recordId: id,
        input: { categoryIds: record.share.categoryIds, evolution: record.share.evolution, includeNote: record.share.includeNote },
      },
      { onError: () => toast.error(t("players.evaluationSharing.share.error")) }
    );
  };

  const handleUnshare = () => {
    unshare.mutate(id, { onError: () => toast.error(t("players.evaluationSharing.share.error")) });
  };

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
          {canShare ? (
            <Button variant="ghost" size="icon" onPress={openShareFlow} testID={`evaluation-history-share-${id}`}
              accessibilityLabel={t("players.evaluationSharing.share.action")}>
              <Ionicons name="share-outline" size={18} color={lightTheme.foreground} />
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

      {/* One reserved line (min-h) for the status and its two actions inline, empty
          when unshared: a share-state change never shifts anything below it. */}
      {canShare ? (
        <View className="min-h-[18px] flex-row flex-wrap items-center gap-x-3" testID={`evaluation-history-share-status-${id}`}>
          {record.share ? (
            <>
              <Text className="text-xs font-medium text-success">
                {t("players.evaluationSharing.share.sharedOn", { date: formatEvaluationDate(record.share.sharedAt, i18n.language) })}
              </Text>
              <Button variant="link" size="sm" className="h-auto px-0 py-0" disabled={busy} onPress={handleUnshare}
                testID={`evaluation-history-unshare-${id}`}>
                <Text className="text-xs">{t("players.evaluationSharing.share.unshare")}</Text>
              </Button>
              {record.share.stale ? (
                <Button variant="link" size="sm" className="h-auto px-0 py-0" disabled={busy} onPress={handleUpdateShare}
                  testID={`evaluation-history-update-share-${id}`}>
                  <Text className="text-xs">{t("players.evaluationSharing.share.update")}</Text>
                </Button>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
