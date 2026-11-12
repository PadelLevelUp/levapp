import { Ionicons } from "@expo/vector-icons";
import { notificationEngineApi } from "@levelup/api";
import { useCoachDisplayName } from "@levelup/hooks";
import {
  approvalQueuePreview,
  approvalSideKey,
  engineStageLine,
  lightTheme,
} from "@levelup/config";
import type { ApprovalAction } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { engineEmptyReasons, type EngineApprovalCardData } from "./approval-bundle";

// Ionicons take a color string, not a class (replacement-approval-card.tsx's APPROVED_ICON_COLOR).
const APPROVED_ICON_COLOR = "#059669";

type Props = {
  request: EngineApprovalCardData;
  readOnly?: boolean;
  onResult?: (action: ApprovalAction) => void;
  /** Rule 8 (PAD-545): "Ignorar" lives on the class's card only. */
  allowDismiss?: boolean;
};

type Outcome = "approved" | "dismissed" | "stale";

/**
 * PAD-920 (semi-auto-approval N5): the card for a new-engine request, on iOS. One block per spot
 * type with its queue in order (rule 7a's preview: the first five, "Ver mais (N)", and the
 * truncation line), a remove toggle per student, and "Sim" with the removed ids. There is no "at
 * the window" button: the new engine raises no request before the window (N2).
 */
export function EngineApprovalCard({ request, readOnly = false, onResult, allowDismiss = false }: Props) {
  const { t } = useTranslation();
  const displayName = useCoachDisplayName();
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [responding, setResponding] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  // The answer given here wins; otherwise what the host says the request is.
  const shown: Outcome | null =
    outcome ?? (request.status === "pending" ? null : request.status);
  const showActions = !shown && !readOnly;

  const toggleRemoved = (playerId: string) =>
    setRemoved((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );

  const handleRespond = async (action: "yes_now" | "dismiss") => {
    if (responding || shown) return;
    setResponding(true);
    try {
      const result = await notificationEngineApi.respondToEngineApproval({
        bundleId: request.requestId,
        action,
        ...(action === "yes_now" ? { removed } : {}),
      });
      // N2: an answer naming a request no longer pending decided nothing; the card says so.
      setOutcome(result.result);
      if (result.result !== "stale") onResult?.(action);
    } catch {
      toast.error(t("notificationsUi.replacementApproval.genericError"));
    } finally {
      setResponding(false);
    }
  };

  const badge = () => {
    switch (shown) {
      case "stale":
        return (
          <View testID="approval-replaced" className="flex-row items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5">
            <Text className="text-xs font-medium text-warning">
              {t("notificationsUi.replacementApproval.replacedByNewer")}
            </Text>
          </View>
        );
      case "approved":
        return (
          <View testID="approval-approved" className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
            <Ionicons name="checkmark" size={14} color={APPROVED_ICON_COLOR} />
            <Text className="text-xs font-medium text-success">
              {t("notificationsUi.replacementApproval.approved")}
            </Text>
          </View>
        );
      case "dismissed":
        return (
          <View testID="approval-dismissed" className="flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5">
            <Ionicons name="close" size={14} color={lightTheme.destructive} />
            <Text className="text-xs font-medium text-destructive">
              {t("notificationsUi.replacementApproval.dismissed")}
            </Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View testID="replacement-approval-card" className="gap-3 rounded-xl border border-border bg-card p-3">
      {request.spotTypes.map((spotType) => {
        const key = `${spotType.side ?? "any"}-${spotType.levelId ?? "any"}`;
        const isExpanded = !!expanded[key];
        const { shown: rows, hidden } = approvalQueuePreview(spotType.queue, isExpanded);
        const reasons = engineEmptyReasons(spotType);
        return (
          <View key={key} className="gap-2" testID="approval-block">
            <Text className="text-xs font-medium text-muted-foreground" testID="approval-spot-type">
              {[t(approvalSideKey(spotType.side)), spotType.levelLabel].filter(Boolean).join(" · ")}
            </Text>

            {spotType.queue.length > 0 ? (
              <View className="gap-1">
                {rows.map((player, index) => {
                  const isRemoved = removed.includes(player.playerId);
                  const name = displayName(player.playerId, player.nickname || player.name);
                  return (
                    <View key={player.playerId} className="flex-row items-center gap-2">
                      <Text className="w-5 text-right text-xs text-muted-foreground">{index + 1}.</Text>
                      <Text
                        testID={`approval-player-${player.playerId}`}
                        className={cn("shrink text-sm", isRemoved && "text-muted-foreground line-through")}
                      >
                        {name}
                      </Text>
                      {showActions ? (
                        <Pressable
                          testID={`approval-remove-${player.playerId}`}
                          role="button"
                          accessibilityLabel={name}
                          accessibilityState={{ selected: isRemoved }}
                          hitSlop={8}
                          disabled={responding}
                          onPress={() => toggleRemoved(player.playerId)}
                          className="ml-auto"
                        >
                          <Ionicons
                            name={isRemoved ? "arrow-undo-outline" : "close-circle-outline"}
                            size={18}
                            color={lightTheme.mutedForeground}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
                {/* Rule 7a: the preview is never the invite set; say so whenever it is truncated. */}
                {hidden > 0 ? (
                  <Text className="text-[11px] text-muted-foreground" testID="approval-showing-of">
                    {t("notificationsUi.replacementApproval.showingOf", { shown: rows.length, total: spotType.queue.length })}
                  </Text>
                ) : null}
                {hidden > 0 || isExpanded ? (
                  <Pressable
                    testID="approval-show-more"
                    role="button"
                    hitSlop={8}
                    onPress={() => setExpanded((e) => ({ ...e, [key]: !isExpanded }))}
                  >
                    <Text className="text-xs font-medium text-primary">
                      {isExpanded
                        ? t("notificationsUi.replacementApproval.showLess")
                        : t("notificationsUi.replacementApproval.showMore", { count: hidden })}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="gap-0.5">
                <Text className="text-xs italic text-muted-foreground">
                  {t("notificationsUi.replacementApproval.noEligiblePlayers")}
                </Text>
                {/* N5: an empty type says why, with the dry run's stage words (invite-simulation N6). */}
                {reasons.length > 0 ? (
                  <View testID="approval-empty-reasons">
                    {reasons.map((r) => {
                      const line = engineStageLine(r.stage);
                      return (
                        <Text key={r.stage} className="text-xs text-muted-foreground" testID={`approval-empty-reason-${r.stage}`}>
                          {`${r.count} · ${t(line.key, line.params)}`}
                        </Text>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            )}
          </View>
        );
      })}

      {shown ? (
        <View className="flex-row">{badge()}</View>
      ) : showActions ? (
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            testID="approval-yes"
            role="button"
            disabled={responding}
            onPress={() => void handleRespond("yes_now")}
            className={cn("min-w-28 flex-1 items-center rounded-xl bg-primary px-3 py-1.5", responding && "opacity-50")}
          >
            <Text className="text-sm font-medium text-primary-foreground">
              {removed.length > 0
                ? t("notificationsUi.replacementApproval.yesRemoved", { count: removed.length })
                : t("common.yes")}
            </Text>
          </Pressable>
          {allowDismiss ? (
            <Pressable
              testID="approval-dismiss"
              role="button"
              disabled={responding}
              onPress={() => void handleRespond("dismiss")}
              className={cn("min-w-16 flex-1 items-center rounded-xl bg-muted px-3 py-1.5", responding && "opacity-50")}
            >
              <Text className="text-sm font-medium text-foreground">
                {t("notificationsUi.replacementApproval.ignore")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
