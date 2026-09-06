import { Ionicons } from "@expo/vector-icons";
import { notificationEngineApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import type { ApprovalAction, ApprovalBundle } from "@levelup/types";
import { format } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import {
  approvalCardState,
  approvalRespondOutcome,
  queueBadgeLabel,
} from "./approval-bundle";

// Ionicons take a color string, not a class — same one-off pattern as
// message-bubble.tsx's ACCEPTED_ICON_COLOR.
const APPROVED_ICON_COLOR = "#059669";

type Props = {
  bundle: ApprovalBundle;
  /** Render without action buttons (viewing your own message). */
  readOnly?: boolean;
  /** Fires after the server records an answer, for cache/toast follow-up. */
  onResult?: (action: ApprovalAction) => void;
};

/**
 * Coach's approve/dismiss surface for semi-automatic invitation mode
 * (PAD-168). Port of `apps/web/src/components/notifications/
 * ReplacementApprovalCard.tsx`; every string comes from the shared
 * `notificationsUi.replacementApproval.*` namespace, which
 * `src/lib/i18n.ts` already imports for both languages.
 *
 * The state rules live in `approval-bundle.ts` so they are unit-testable —
 * mobile screens and components are not (see vitest.config.ts).
 */
export function ReplacementApprovalCard({
  bundle,
  readOnly = false,
  onResult,
}: Props) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const [responding, setResponding] = React.useState(false);
  const [localResponse, setLocalResponse] = React.useState<ApprovalAction | null>(
    null
  );
  const [staleVacancyIds, setStaleVacancyIds] = React.useState<number[]>([]);

  const state = approvalCardState(bundle, {
    staleVacancyIds,
    localResponse,
    readOnly,
  });

  // Web formats the window with toLocaleString; date-fns is what mobile uses
  // everywhere else, and PAD-157 requires the locale be passed explicitly or
  // a Portuguese device renders English weekday/month names.
  const windowLabel = React.useMemo(() => {
    if (!bundle.windowOpenAt) return null;
    const date = new Date(bundle.windowOpenAt);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, "EEE, d MMM, HH:mm", { locale });
  }, [bundle.windowOpenAt, locale]);

  const handleRespond = async (action: ApprovalAction) => {
    if (responding || state.response) return;
    setResponding(true);
    try {
      const result = await notificationEngineApi.respondToApproval(
        bundle.bundleId,
        action
      );
      // Trust the server's action, not the tap — same rule as the reminder
      // answers in message-bubble.tsx.
      const recorded = result?.action ?? action;
      setLocalResponse(recorded);
      const outcome = approvalRespondOutcome(result?.vacancies);
      setStaleVacancyIds(outcome.staleVacancyIds);
      // The mobile toast primitive has no `info` variant (success/error only);
      // "these spots are gone" is news the coach did not want, so error fits.
      if (outcome.toastKey) toast.error(t(outcome.toastKey));
      onResult?.(recorded);
    } catch {
      toast.error(t("notificationsUi.replacementApproval.genericError"));
    } finally {
      setResponding(false);
    }
  };

  const responseBadge = () => {
    if (state.allStale) {
      return (
        <View className="flex-row items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5">
          <Text className="text-xs font-medium text-warning">
            {t("notificationsUi.replacementApproval.noLongerNeeded")}
          </Text>
        </View>
      );
    }
    switch (state.response) {
      case "yes_now":
        return (
          <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
            <Ionicons name="checkmark" size={14} color={APPROVED_ICON_COLOR} />
            <Text className="text-xs font-medium text-success">
              {t("notificationsUi.replacementApproval.approved")}
            </Text>
          </View>
        );
      case "yes_at_window":
        return (
          <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
            <Ionicons
              name="time-outline"
              size={14}
              color={APPROVED_ICON_COLOR}
            />
            <Text className="text-xs font-medium text-success">
              {t("notificationsUi.replacementApproval.scheduledFor", {
                window:
                  windowLabel ??
                  t("notificationsUi.replacementApproval.windowOpen"),
              })}
            </Text>
          </View>
        );
      case "dismiss":
        return (
          <View className="flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5">
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
    <View
      testID="replacement-approval-card"
      className="gap-3 rounded-xl border border-border bg-card p-3"
    >
      {bundle.vacancies.map((vacancy) => {
        const isStale = staleVacancyIds.includes(vacancy.vacancyId);
        return (
          <View key={vacancy.vacancyId} className="gap-2">
            <Text className="text-sm">
              <Text className="text-sm font-semibold">
                {vacancy.declinedPlayerName}
              </Text>
              {" "}
              {t("notificationsUi.replacementApproval.confirmedWontAttend")}
            </Text>

            {vacancy.waitingListPlayerName ? (
              <Text className="text-xs">
                <Text className="text-xs font-medium">
                  {vacancy.waitingListPlayerName}
                </Text>
                {" "}
                {t("notificationsUi.replacementApproval.waitingListAdded")}
              </Text>
            ) : null}

            {vacancy.queue.length > 0 ? (
              <View className="gap-1">
                <Text className="text-xs font-medium text-muted-foreground">
                  {t("notificationsUi.replacementApproval.inviteQueue")}
                </Text>
                {vacancy.queue.map((player, index) => {
                  const badge = queueBadgeLabel(player);
                  return (
                    <View
                      key={player.id}
                      className="flex-row items-center gap-2"
                    >
                      <Text className="w-5 text-right text-xs text-muted-foreground">
                        {index + 1}.
                      </Text>
                      <Text className="shrink text-sm">{player.name}</Text>
                      {badge ? (
                        <View className="rounded-full bg-muted px-1.5 py-0.5">
                          <Text className="text-[10px] font-medium text-muted-foreground">
                            {"text" in badge
                              ? badge.text
                              : t(badge.key, badge.params)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="text-xs italic text-muted-foreground">
                {t("notificationsUi.replacementApproval.noEligiblePlayers")}
              </Text>
            )}

            {isStale && !state.allStale ? (
              <View className="self-start rounded-full bg-warning/15 px-2 py-0.5">
                <Text className="text-[10px] font-medium text-warning">
                  {t("notificationsUi.replacementApproval.noLongerNeeded")}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {state.response || state.allStale ? (
        <View className="flex-row">{responseBadge()}</View>
      ) : state.showActions ? (
        <View className="gap-1.5">
          <Text className="text-xs font-medium text-muted-foreground">
            {t("notificationsUi.replacementApproval.inviteReplacements")}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              testID="approve-invitations-now"
              accessibilityLabel={t(
                "notificationsUi.replacementApproval.yesRightNow"
              )}
              role="button"
              disabled={responding}
              onPress={() => void handleRespond("yes_now")}
              className={cn(
                "min-w-28 flex-1 items-center rounded-xl bg-primary px-3 py-1.5",
                responding && "opacity-50"
              )}
            >
              <Text className="text-sm font-medium text-primary-foreground">
                {t("notificationsUi.replacementApproval.yesRightNow")}
              </Text>
            </Pressable>

            {state.windowOpenInFuture && windowLabel ? (
              <Pressable
                testID="approve-invitations-at-window"
                accessibilityLabel={t(
                  "notificationsUi.replacementApproval.approveAtWindowAria"
                )}
                role="button"
                disabled={responding}
                onPress={() => void handleRespond("yes_at_window")}
                className={cn(
                  "min-w-28 flex-1 items-center rounded-xl bg-primary/10 px-3 py-1.5",
                  responding && "opacity-50"
                )}
              >
                <Text className="text-sm font-medium text-primary">
                  {t("notificationsUi.replacementApproval.yesAt", {
                    window: windowLabel,
                  })}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="dismiss-invitations"
              accessibilityLabel={t("notificationsUi.replacementApproval.no")}
              role="button"
              disabled={responding}
              onPress={() => void handleRespond("dismiss")}
              className={cn(
                "min-w-16 flex-1 items-center rounded-xl bg-muted px-3 py-1.5",
                responding && "opacity-50"
              )}
            >
              <Text className="text-sm font-medium text-foreground">
                {t("notificationsUi.replacementApproval.no")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
