import { Ionicons } from "@expo/vector-icons";
import { messagesApi } from "@levelup/api";
import * as attendanceApi from "@levelup/api/src/resources/attendance";
import {
  participantInitials,
  PARTICIPANT_GROUP_WORD_KEYS,
  cancellationDetail,
  sideLongKeyOf,
  groupOfState,
  reminderHint,
} from "@levelup/config";
import { SideInOccurrenceControl, type SideInOccurrence } from "./SideInOccurrenceControl";
import { usePlayerProfile } from "@levelup/hooks";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { openConversation } from "@/features/messages/open-conversation";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { formatEvaluationDate } from "@/features/evaluations/format-date";
import type { ParticipantGroupRow } from "./ParticipantGroups";

/**
 * PAD-659 (`calendar.event-detail` rule 23), the phone's half: a player's profile over the class,
 * a bottom sheet in a native `Modal`. The backdrop, the X and the Android back button close ONLY
 * the sheet; the class screen stays where it was. Pressed visuals are inline `style`, never an
 * `active:` class: that swap inside a Modal once crashed it on iOS (memory
 * native-modal-sheet-traps-ios). No picker or dialog lives in it, so it needs no PortalHost.
 */
interface ParticipantSheetProps {
  row: ParticipantGroupRow | null;
  onClose: () => void;
  /** PAD-551: this player's side in this occurrence, for the coach (the screen's live state). */
  side?: SideInOccurrence;
}

export function ParticipantSheet({ row, onClose, side }: ParticipantSheetProps) {
  const { t, i18n } = useTranslation();
  const playerId = row?.playerId ?? null;

  const attended = useQuery({
    queryKey: ["participant-popup", "attended", playerId],
    queryFn: () => attendanceApi.getAttendanceHistory({ playerId: playerId as string }),
    enabled: !!playerId,
  });
  const missed = useQuery({
    queryKey: ["participant-popup", "missed", playerId],
    queryFn: () => attendanceApi.getAbsenceHistory({ playerId: playerId as string }),
    enabled: !!playerId,
  });
  const profile = usePlayerProfile(playerId);

  const lastEvaluatedAt = (profile.data?.evaluations ?? [])
    .map((e) => e.evaluatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const group = row ? groupOfState(row.state) : "pending";
  const hint = reminderHint(row?.presence);
  const cancelled = cancellationDetail(row?.presence, "coach");
  const contact = row?.roster?.phone || row?.roster?.email || "—";

  const sendMessage = async () => {
    if (!row) return;
    const userId = row.player.userId;
    onClose();
    try {
      const conversation = await messagesApi.createConversation({ otherParticipants: [String(userId)] });
      openConversation(router, `/conversation/${conversation.id}`); // PAD-768: back goes to Mensagens
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    }
  };

  const openProfile = () => {
    if (!row) return;
    const id = row.playerId;
    onClose();
    router.push(`/player/${id}`);
  };

  const fact = (label: string, value: string, testID?: string) => (
    <View className="flex-row justify-between gap-4 border-b border-border py-2">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text testID={testID} className="flex-1 text-right text-sm font-semibold">
        {value}
      </Text>
    </View>
  );

  return (
    <Modal visible={!!row} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("calendar.participants.close")}
          onPress={onClose}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(11,21,36,0.45)" }}
        />
        {row ? (
          <View
            testID="participant-popup"
            accessibilityLabel={t("calendar.participants.popupLabel")}
            className="overflow-hidden bg-background"
            style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" }}
          >
            <View className="flex-row items-center gap-4 p-5" style={{ backgroundColor: "#122240" }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#E8F1FF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="font-bold" style={{ fontSize: 18, color: "#1355DC" }}>{participantInitials(row.name)}</Text>
              </View>
              <View className="flex-1 gap-1.5">
                <Text numberOfLines={1} className="font-bold" style={{ fontSize: 20, color: "#FFFFFF" }}>
                  {row.name}
                </Text>
                {/* PAD-660 (players.nickname rule 3): the real name under the coach's nickname. */}
                {row.realName && row.realName !== row.name ? (
                  <Text numberOfLines={1} testID="participant-popup-real-name" style={{ fontSize: 12, color: "#A9BCD6" }}>
                    {row.realName}
                  </Text>
                ) : null}
                <View className="flex-row flex-wrap gap-1.5">
                  {/* PAD-551: the side the screen reads now (a change re-reads the class), else the row's. */}
                  {(side?.current ?? row.side) ? (
                    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 6, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" }}>
                      <Text className="font-semibold" style={{ fontSize: 11, color: "#9CC6FF" }}>{t(sideLongKeyOf((side?.current ?? row.side)!, row.assignedSide))}</Text>
                    </View>
                  ) : null}
                  {row.level?.label ? (
                    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 6, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" }}>
                      <Text className="font-bold" style={{ fontSize: 11, color: "#9CC6FF" }}>
                        {t("calendar.participants.level", { level: row.level.label })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Pressable
                testID="participant-popup-close"
                accessibilityRole="button"
                accessibilityLabel={t("calendar.participants.close")}
                onPress={onClose}
                style={({ pressed }) => ({
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: pressed ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)",
                })}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}>
              {fact(t("calendar.participants.inThisClass"), t(PARTICIPANT_GROUP_WORD_KEYS[group]), "participant-popup-state")}
              {side ? (
                <View className="gap-1 py-2" testID="participant-popup-side">
                  <SideInOccurrenceControl playerId={row.playerId} side={side} />
                </View>
              ) : null}
              {hint ? (
                <Text className="py-1 text-xs text-muted-foreground" testID="attendance-reminder-hint">
                  {t(hint)}
                </Text>
              ) : null}
              {cancelled ? (
                <Text className="py-1 text-xs text-muted-foreground" testID="attendance-cancelled-by-student">
                  {t(cancelled.key, {
                    when: new Date(cancelled.when).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
                  })}
                </Text>
              ) : null}
              {fact(
                t("calendar.participants.attendance"),
                attended.data && missed.data
                  ? t("calendar.participants.attendanceValue", { attended: attended.data.total, missed: missed.data.total })
                  : "—"
              )}
              {fact(
                t("calendar.participants.lastEvaluation"),
                lastEvaluatedAt
                  ? formatEvaluationDate(lastEvaluatedAt.slice(0, 10), i18n.language)
                  : profile.isSuccess
                    ? t("calendar.participants.noEvaluations")
                    : "—"
              )}
              {fact(t("calendar.participants.contact"), contact)}
            </ScrollView>

            <View className="flex-row gap-2 px-5 pb-8 pt-2">
              <Pressable
                testID="participant-popup-message"
                accessibilityRole="button"
                onPress={sendMessage}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#E8F1FF",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text className="font-semibold" style={{ fontSize: 13, color: "#1355DC" }}>{t("calendar.participants.sendMessage")}</Text>
              </Pressable>
              <Pressable
                testID="participant-popup-profile"
                accessibilityRole="button"
                onPress={openProfile}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#1355DC",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text className="font-semibold" style={{ fontSize: 13, color: "#FFFFFF" }}>{t("calendar.participants.fullProfile")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
