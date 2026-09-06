import { Ionicons } from "@expo/vector-icons";
import {
  blockedNames,
  blockedReasons,
  lightTheme,
  shouldReportSent,
  splitBlockedByCause,
} from "@levelup/config";
import { playersApi } from "@levelup/api";
import type { CalendarEvent, CoachPlayer, StudentGroup } from "@levelup/types";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useNotificationGroups, useSendManualNotifications } from "./hooks";

interface NotifyModalProps {
  open: boolean;
  onClose: () => void;
  event: CalendarEvent;
  /** Player ids already on the class — excluded from the individual search. */
  existingPlayerIds: string[];
  /** Fires after a successful send, so the caller can e.g. open the Invited list. */
  onSent?: () => void;
}

/** Ports web's ManualNotificationModal.tsx: notification groups as
 * collapsible multi-select checkboxes, plus an individual player search,
 * both feeding one flat playerIds array into useSendManualNotifications —
 * matches exactly what web sends (group membership is just resolved to
 * playerIds client-side before the request). */
export function NotifyModal({
  open,
  onClose,
  event,
  existingPlayerIds,
  onSent,
}: NotifyModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(
    new Set()
  );

  const originalId = String(event.originalId);

  // Lazily enabled (only while the modal is open) via useNotificationGroups'
  // own `enabled: !!model && !!originalId && !!date` gate — passing
  // undefined args while closed disables both queries without needing to
  // touch features/calendar/hooks.ts.
  const { data: groups, isPending: loadingGroups } = useNotificationGroups(
    open ? event.model : undefined,
    open ? originalId : undefined,
    open ? event.date : undefined
  );
  const { data: allPlayers } = useQuery({
    queryKey: ["coach-players-all"],
    queryFn: playersApi.getCoachPlayers,
    enabled: open,
  });

  const sendNotifications = useSendManualNotifications();

  const existingSet = React.useMemo(
    () => new Set(existingPlayerIds),
    [existingPlayerIds]
  );

  const allEligible = React.useMemo(
    () => (allPlayers ?? []).filter((p) => !existingSet.has(p.playerId)),
    [allPlayers, existingSet]
  );

  const searchResults = React.useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return allEligible.filter((p) => p.name.toLowerCase().includes(q));
  }, [allEligible, search]);

  const togglePlayer = (playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const isGroupAllSelected = (group: StudentGroup) =>
    group.players.length > 0 && group.players.every((p) => selected.has(p.id));

  const toggleGroup = (group: StudentGroup) => {
    const ids = group.players.map((p) => p.id);
    const allSel = isGroupAllSelected(group);
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (allSel ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const resetAndClose = () => {
    setSelected(new Set());
    setSearch("");
    onClose();
  };

  const handleSend = async () => {
    if (selected.size === 0) return;
    try {
      const { sent, blocked } = await sendNotifications.mutateAsync({
        model: event.model,
        originalId,
        date: event.date,
        playerIds: [...selected],
      });
      resetAndClose();
      onSent?.();

      // PAD-170 C6, porting web's ManualNotificationModal. iOS used to drop
      // `blocked` on the floor and report only "sent to N", so a coach whose
      // student had turned invitations off believed everyone was reached. The
      // two causes are told apart (`splitBlockedByCause`) because "they are
      // busy then" and "they turned invitations off" are different problems
      // with different fixes.
      const { unavailable, optedOut } = splitBlockedByCause(blocked);

      // PAD-107: name whoever marked themselves unavailable for this slot.
      if (unavailable.length > 0) {
        toast.error(
          t("calendar.unavailable.blocked", {
            count: unavailable.length,
            names: blockedNames(unavailable),
          })
        );
      }
      // PAD-112: a student who blocked notifications is skipped; naming them
      // (and their own reason, when they gave one) makes the short count read
      // as their choice rather than as a failure. Web uses a warning toast
      // here; the mobile toast has only success/error, and reporting "could
      // not notify" as a success would be a lie, so it takes the error slot.
      if (optedOut.length > 0) {
        toast.error(
          t("calendar.notify.blockedByPreference", {
            names: blockedNames(optedOut),
          }),
          blockedReasons(optedOut) || undefined
        );
      }
      // PAD-107's ordering: no "invitations sent to 0" when everyone was
      // skipped — the toasts above already told the whole story.
      if (shouldReportSent(sent, blocked)) {
        toast.success(t("calendar.notify.invitationSent", { count: sent }));
      }
    } catch {
      toast.error(t("calendar.notify.failedSendInvitations"));
    }
  };

  const GroupPlayerRow = ({
    player,
  }: {
    player: { id: string; name: string; levelCode: string | null };
  }) => (
    <Pressable
      testID={`notify-player-${player.id}`}
      accessibilityLabel={player.name}
      role="button"
      onPress={() => togglePlayer(player.id)}
      className={cn(
        "flex-row items-center gap-3 rounded-lg p-2",
        selected.has(player.id) ? "bg-primary/10" : "active:bg-accent"
      )}
    >
      <Checkbox
        checked={selected.has(player.id)}
        onCheckedChange={() => togglePlayer(player.id)}
      />
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Text className="flex-1 text-sm" numberOfLines={1}>
          {player.name}
        </Text>
        {player.levelCode ? (
          <Text className="text-xs text-muted-foreground">
            {player.levelCode}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? resetAndClose() : null)}>
      <DialogContent testID="class-notify-dialog">
        <DialogHeader>
          <DialogTitle>{t("calendar.notify.title")}</DialogTitle>
        </DialogHeader>

        <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
          <View className="gap-3 p-1">
            {loadingGroups ? (
              <Text className="py-2 text-center text-xs text-muted-foreground">
                {t("calendar.notify.loadingGroups")}
              </Text>
            ) : (
              (groups ?? []).map((group) => {
                const isExpanded = expandedGroups.has(group.id);
                const allSel = isGroupAllSelected(group);
                return (
                  <View
                    key={group.id}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <View className="flex-row items-center gap-2 bg-muted/40 px-3 py-2.5">
                      <Checkbox
                        testID={`notify-group-select-${group.id}`}
                        accessibilityLabel={t("calendar.notify.selectAllIn", {
                          group: group.label,
                        })}
                        checked={allSel}
                        onCheckedChange={() => toggleGroup(group)}
                      />
                      <Pressable
                        accessibilityLabel={group.label}
                        role="button"
                        onPress={() => toggleExpanded(group.id)}
                        className="min-w-0 flex-1 flex-row items-center gap-1.5"
                      >
                        <Text
                          className="flex-1 text-sm font-medium"
                          numberOfLines={1}
                        >
                          {group.label}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          ({group.players.length})
                        </Text>
                        <Ionicons
                          name={isExpanded ? "chevron-down" : "chevron-forward"}
                          size={14}
                          color={lightTheme.mutedForeground}
                        />
                      </Pressable>
                    </View>
                    {isExpanded ? (
                      <View className="gap-0.5 px-2 py-1">
                        {group.players.map((p) => (
                          <GroupPlayerRow key={p.id} player={p} />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}

            <Input
              testID="class-notify-search"
              accessibilityLabel={t("calendar.notify.searchStudents")}
              placeholder={t("calendar.notify.searchPlaceholder")}
              value={search}
              onChangeText={setSearch}
            />

            {search ? (
              <View className="gap-0.5">
                {searchResults.length === 0 ? (
                  <Text className="py-3 text-center text-sm text-muted-foreground">
                    {t("calendar.notify.noResults")}
                  </Text>
                ) : (
                  searchResults.map((p) => (
                    <GroupPlayerRow
                      key={p.playerId}
                      player={{
                        id: p.playerId,
                        name: p.name,
                        levelCode: p.level?.code ?? null,
                      }}
                    />
                  ))
                )}
              </View>
            ) : null}

            {!loadingGroups && (groups ?? []).length === 0 && !search ? (
              <Text className="py-4 text-center text-sm text-muted-foreground">
                {t("calendar.notify.noEligibleStudents")}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            accessibilityLabel={t("calendar.notify.cancel")}
            onPress={resetAndClose}
            disabled={sendNotifications.isPending}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button
            testID="class-notify-send"
            accessibilityLabel={t("calendar.notify.send")}
            className="flex-1"
            disabled={selected.size === 0 || sendNotifications.isPending}
            onPress={() => void handleSend()}
          >
            {sendNotifications.isPending ? (
              <Spinner size="small" color={lightTheme.primaryForeground} />
            ) : (
              <Ionicons
                name="send-outline"
                size={16}
                color={lightTheme.primaryForeground}
              />
            )}
            <Text>
              {selected.size > 0
                ? t("calendar.notify.sendToCount", { count: selected.size })
                : t("calendar.notify.send")}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
