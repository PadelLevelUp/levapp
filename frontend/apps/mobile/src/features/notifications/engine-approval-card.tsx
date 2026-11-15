import { Ionicons } from "@expo/vector-icons";
import { notificationEngineApi } from "@levelup/api";
import { useCoachDisplayName } from "@levelup/hooks";
import {
  approvalQueuePreview,
  engineApprovalGroupName,
  engineApprovalRequest,
  engineApprovalYesLabel,
  engineEmptyQueueReasons,
  engineSideKey,
  engineSideSlug,
  lightTheme,
  resolveText,
} from "@levelup/config";
import type { ApprovalAction, EngineApprovalMeta } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Ionicons take a color string, not a class (replacement-approval-card.tsx's APPROVED_ICON_COLOR).
const APPROVED_ICON_COLOR = "#059669";

/**
 * A new-engine request in one shape for both hosts: the message's metadata (N4), or one of the
 * class's requests built with `engineApprovalCardOf` (N1), one per group.
 */
export type EngineApprovalSource = EngineApprovalMeta;

type Props = {
  source: EngineApprovalSource;
  readOnly?: boolean;
  onResult?: (action: ApprovalAction) => void;
  /** Rule 8 (PAD-545): "Ignorar" lives on the class's card only. */
  allowDismiss?: boolean;
};

type Outcome = "approved" | "dismissed" | "stale";

/** The group's name opens the title: "lista de espera" reads "Lista de espera". */
const capitalizeFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** N4/N5: what a request no longer pending says; `replaced` (or an older `responded`) reads as stale. */
function outcomeFromState(state: string | undefined, responded: boolean): Outcome | null {
  if (state === "approved") return "approved";
  if (state === "dismissed") return "dismissed";
  if (state === "replaced") return "stale";
  return responded ? "stale" : null;
}

/**
 * PAD-920 (semi-auto-approval N5): the card for a new-engine request, on iOS, titled with the group
 * it asks for (the owner's per-group approval, ND1's words). Then one block per spot
 * type (side, level and its open spots) with its queue in order (rule 7a's preview: the first five,
 * "Ver mais (N)", and the truncation line), a remove toggle per student, and "Sim" with the removed
 * ids. There is no "at the window" button: the new engine raises no request before the window (N2).
 * What it reads and says comes from `@levelup/config`'s engine-approval-display, as web's card does.
 */
export function EngineApprovalCard({ source, readOnly = false, onResult, allowDismiss = false }: Props) {
  const { t } = useTranslation();
  const displayName = useCoachDisplayName();
  const request = engineApprovalRequest(source);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [responding, setResponding] = React.useState(false);
  // N2: set before the await, so a second tap in the same frame never sends a second answer.
  const inFlight = React.useRef(false);
  // Only the coach's own answer here is state; what the request says is read on every render, so a
  // `message_edited` turning a mounted card replaced, approved or dismissed shows that line (N4/N5).
  const [localOutcome, setLocalOutcome] = React.useState<Outcome | null>(null);

  if (!request) return null;
  const stateOutcome = outcomeFromState(request.state, request.responded);
  // A `stale` answer never hides an approval or a dismissal the request already reads.
  const outcome =
    localOutcome === "stale" && (stateOutcome === "approved" || stateOutcome === "dismissed")
      ? stateOutcome
      : (localOutcome ?? stateOutcome);
  const actionable = !outcome && !request.responded && !readOnly;

  const toggleRemoved = (playerId: string) =>
    setRemoved((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );

  const handleRespond = async (action: "yes_now" | "dismiss") => {
    if (inFlight.current || !actionable) return;
    inFlight.current = true;
    setResponding(true);
    try {
      const result = await notificationEngineApi.respondToEngineApproval({
        bundleId: request.requestId,
        action,
        ...(action === "yes_now" ? { removed } : {}),
      });
      // N2: an answer naming a request no longer pending decided nothing; the card says so.
      setLocalOutcome((prev) =>
        result.result === "stale" && (prev === "approved" || prev === "dismissed") ? prev : result.result
      );
      if (result.result !== "stale") onResult?.(action);
    } catch {
      toast.error(t("notificationsUi.replacementApproval.genericError"));
    } finally {
      inFlight.current = false;
      setResponding(false);
    }
  };

  const yesLabel = engineApprovalYesLabel(removed.length);

  return (
    <View testID="replacement-approval-card" className="gap-3 rounded-xl border border-border bg-card p-3">
      {/* N5: the card is titled with the group it asks for (ND1's words). */}
      {request.group ? (
        <Text className="text-sm font-semibold" testID="approval-group">
          {capitalizeFirst(resolveText(t, engineApprovalGroupName(request.group)))}
        </Text>
      ) : null}
      {request.spotTypes.map((spotType, index) => {
        const slug = engineSideSlug(spotType.side);
        const isExpanded = !!expanded[index];
        const { shown: rows, hidden } = approvalQueuePreview(spotType.queue, isExpanded);
        const reasons = engineEmptyQueueReasons(spotType);
        return (
          <View key={`${slug}-${spotType.levelId ?? "any"}-${index}`} className="gap-2" testID={`approval-type-${slug}`}>
            {/* N5: side and level, then the type's open spots. */}
            <Text className="text-xs font-medium text-muted-foreground" testID="approval-type-header">
              {t(engineSideKey(spotType.side))}
              {spotType.levelLabel ? ` · ${spotType.levelLabel}` : ""}
              {typeof spotType.count === "number" ? ` · ${t("tutorials.engine.openSpots", { count: spotType.count })}` : ""}
            </Text>

            {spotType.queue.length > 0 ? (
              <View className="gap-1">
                {rows.map((player, i) => {
                  const isRemoved = removed.includes(player.playerId);
                  const name = displayName(player.playerId, player.nickname || player.name);
                  return (
                    <View key={player.playerId} className="flex-row items-center gap-2">
                      <Text className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</Text>
                      <Text
                        testID={`approval-name-${player.playerId}`}
                        className={cn("shrink text-sm", isRemoved && "text-muted-foreground line-through")}
                      >
                        {name}
                      </Text>
                      {actionable ? (
                        <Pressable
                          testID={`approval-remove-${player.playerId}`}
                          role="button"
                          accessibilityLabel={t(
                            isRemoved
                              ? "notificationsUi.replacementApproval.engine.restore"
                              : "notificationsUi.replacementApproval.engine.remove",
                            { name }
                          )}
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
                    accessibilityState={{ expanded: isExpanded }}
                    hitSlop={8}
                    onPress={() => setExpanded((e) => ({ ...e, [index]: !isExpanded }))}
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
                {/* N5: an empty type says why, in N6's words, one line per stage with its count. */}
                {reasons.length > 0 ? (
                  <View testID="approval-empty-reasons">
                    {reasons.map((r) => (
                      <Text key={r.stage} className="text-xs text-muted-foreground" testID={`approval-empty-reason-${r.stage}`}>
                        {t("notificationsUi.replacementApproval.engine.reasonCount", { reason: resolveText(t, r.line), count: r.count })}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </View>
        );
      })}

      {outcome === "stale" ? (
        <Text className="text-xs text-muted-foreground" testID="approval-replaced">
          {t("notificationsUi.replacementApproval.engine.replaced")}
        </Text>
      ) : outcome === "approved" ? (
        <View className="flex-row">
          <View testID="approval-outcome" className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
            <Ionicons name="checkmark" size={14} color={APPROVED_ICON_COLOR} />
            <Text className="text-xs font-medium text-success">
              {t("notificationsUi.replacementApproval.approved")}
            </Text>
          </View>
        </View>
      ) : outcome === "dismissed" ? (
        <View className="flex-row">
          <View testID="approval-outcome" className="flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5">
            <Ionicons name="close" size={14} color={lightTheme.destructive} />
            <Text className="text-xs font-medium text-destructive">
              {t("notificationsUi.replacementApproval.engine.dismissed")}
            </Text>
          </View>
        </View>
      ) : actionable ? (
        // N2/N5: no "at the window" for a new-engine request; "Ignorar" only on the class's card.
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            testID="approval-yes"
            role="button"
            disabled={responding}
            onPress={() => void handleRespond("yes_now")}
            className={cn("min-w-28 flex-1 items-center rounded-xl bg-primary px-3 py-1.5", responding && "opacity-50")}
          >
            <Text className="text-sm font-medium text-primary-foreground">
              {t(yesLabel.key, yesLabel.params)}
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
