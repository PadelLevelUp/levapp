import type {
  AbsenceJustification,
  Player,
  Presence,
  PresenceStatus,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface AttendanceState {
  status: PresenceStatus | null;
  justification?: AbsenceJustification;
}

/** Backend serializes participants as { id, userId, user: {...} }. */
export function playerName(player: Player): string {
  return player.user?.name ?? "Player";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

type ParticipantRowProps = {
  player: Player;
  presence?: Presence;
  attendance: AttendanceState;
  onChange?: (state: AttendanceState) => void;
  /** Coaches can mark attendance; students only see status. */
  canMark: boolean;
};

/** Mobile analogue of the web AttendanceRow: name + presence badges, with
 * present/absent toggles (and justification for absences) for coaches. */
export function ParticipantRow({
  player,
  presence,
  attendance,
  onChange,
  canMark,
}: ParticipantRowProps) {
  const name = playerName(player);
  const playerId = String(player.id);

  const setStatus = (status: PresenceStatus) => {
    if (status === "present") {
      onChange?.({ status: "present", justification: undefined });
    } else {
      onChange?.({
        status: "absent",
        justification: attendance.justification ?? "unjustified",
      });
    }
  };

  const { t, i18n } = useTranslation();

  return (
    <View
      testID={`class-participant-${playerId}`}
      className="gap-2 rounded-lg bg-muted p-3"
    >
      <View className="flex-row items-center gap-2">
        <Avatar alt={name} className="h-8 w-8">
          <AvatarFallback>
            <Text className="text-xs">{initials(name)}</Text>
          </AvatarFallback>
        </Avatar>
        <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
          {name}
        </Text>

        {/* PAD-199 (B-017): the badge follows a message that exists —
            `reminderSentAt` — never `invited`, which is roster membership. */}
        {presence?.confirmed || presence?.reminderSentAt ? (
          <Badge
            variant={presence.confirmed ? "success" : "warning"}
            testID="attendance-signal"
          >
            <Text>
              {presence.confirmed
                ? t("calendar.attendance.confirmedAttendance")
                : t("calendar.attendance.reminderSent")}
            </Text>
          </Badge>
        ) : null}

        {attendance.status === "present" ? (
          <Badge variant="success">
            <Text>{t("calendar.attendance.present")}</Text>
          </Badge>
        ) : null}
        {attendance.status === "absent" ? (
          <Badge
            variant={
              attendance.justification === "justified"
                ? "warning"
                : "destructive"
            }
          >
            <Text>
              {attendance.justification === "justified"
                ? t("calendar.attendance.justified")
                : t("calendar.attendance.absent")}
            </Text>
          </Badge>
        ) : null}
      </View>

      {/* PAD-288 (attendance.confirm rule 23): the student's own cancellation, with its time. */}
      {presence?.cancelledByStudent && presence.cancelledAt ? (
        <Text className="text-xs text-muted-foreground" testID="attendance-cancelled-by-student">
          {t("calendar.detail.cancelledByStudentAt", {
            when: new Date(presence.cancelledAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
          })}
        </Text>
      ) : null}

      {canMark ? (
        <View className="flex-row gap-2">
          <Button
            testID={`attendance-present-${playerId}`}
            accessibilityLabel={t("calendar.attendance.markPresent", { name })}
            variant={attendance.status === "present" ? "default" : "outline"}
            size="sm"
            className={cn(
              "flex-1",
              attendance.status === "present" && "bg-success"
            )}
            onPress={() => setStatus("present")}
          >
            <Text
              className={cn(
                attendance.status === "present" && "text-success-foreground"
              )}
            >
              {t("calendar.attendance.present")}
            </Text>
          </Button>
          <Button
            testID={`attendance-absent-${playerId}`}
            accessibilityLabel={t("calendar.attendance.markAbsent", { name })}
            variant={attendance.status === "absent" ? "destructive" : "outline"}
            size="sm"
            className="flex-1"
            onPress={() => setStatus("absent")}
          >
            <Text>{t("calendar.attendance.absent")}</Text>
          </Button>
        </View>
      ) : null}

      {canMark && attendance.status === "absent" ? (
        <View className="flex-row gap-2">
          <Button
            testID={`attendance-justified-${playerId}`}
            accessibilityLabel={t("calendar.attendance.markJustified", { name })}
            variant={
              attendance.justification === "justified" ? "default" : "outline"
            }
            size="sm"
            className={cn(
              "flex-1",
              attendance.justification === "justified" && "bg-warning"
            )}
            onPress={() =>
              onChange?.({ status: "absent", justification: "justified" })
            }
          >
            <Text
              className={cn(
                "text-xs",
                attendance.justification === "justified" &&
                  "text-warning-foreground"
              )}
            >
              {t("calendar.attendance.justified")}
            </Text>
          </Button>
          <Button
            testID={`attendance-unjustified-${playerId}`}
            accessibilityLabel={t("calendar.attendance.markUnjustified", { name })}
            variant={
              attendance.justification === "unjustified"
                ? "destructive"
                : "outline"
            }
            size="sm"
            className="flex-1"
            onPress={() =>
              onChange?.({ status: "absent", justification: "unjustified" })
            }
          >
            <Text className="text-xs">
              {t("calendar.attendance.unjustified")}
            </Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
