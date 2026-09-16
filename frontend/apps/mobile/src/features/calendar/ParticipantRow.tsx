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
import {
  attendanceStateLabelKey,
  attendanceStateOf,
  attendanceStateTone,
  cancellationDetail,
  reminderHint,
  type StateAudience,
  type StateTone,
} from "@levelup/config";

export interface AttendanceState {
  status: PresenceStatus | null;
  justification?: AbsenceJustification;
}

/** Backend serializes participants as { id, userId, user: {...} }. */
export function playerName(player: Player): string {
  return player.user?.name ?? "Player";
}

/** The shared tone → this shell's Badge variant. Web maps the same tones to CSS. */
const BADGE_VARIANT: Record<StateTone, "secondary" | "success" | "warning" | "destructive"> = {
  neutral: "secondary",
  positive: "success",
  warning: "warning",
  negative: "destructive",
};

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
  /**
   * PAD-313 rule 25: whose row this is, so the ONE state word addresses the
   * right person — "Vais" to the student about themselves, "Vai" to the coach
   * about them.
   */
  audience?: StateAudience;
};

/** Mobile analogue of the web AttendanceRow: name + presence badges, with
 * present/absent toggles (and justification for absences) for coaches. */
export function ParticipantRow({
  player,
  presence,
  attendance,
  onChange,
  canMark,
  audience = "coach",
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

  // PAD-313: one state, one source, same helper as web.
  const state = attendanceStateOf(presence);
  const cancellation = cancellationDetail(presence, audience);
  const reminder = reminderHint(presence);

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

        {/* PAD-313 rule 25: ONE state word. The chip above it read
            `presence.confirmed`, which means ANSWERED, so a cancelled student
            showed "presença confirmada" beside "falta justificada" — the
            founder's report. The coach's toggle below still writes the mark. */}
        {presence ? (
          <Badge variant={BADGE_VARIANT[attendanceStateTone(state)]} testID="attendance-state">
            <Text>{t(attendanceStateLabelKey(state, audience))}</Text>
          </Badge>
        ) : null}
      </View>

      {/* Secondary facts, each on its own line and never a second state word:
          who cancelled and when (rule 23's provenance, coach's row only while
          unvalidated), and B-017's reminder signal while nobody has answered. */}
      {cancellation ? (
        <Text className="text-xs text-muted-foreground" testID="attendance-cancelled-by-student">
          {t(cancellation.key, {
            when: new Date(cancellation.when).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }),
          })}
        </Text>
      ) : null}
      {reminder ? (
        <Text className="text-xs text-muted-foreground" testID="attendance-reminder-hint">
          {t(reminder)}
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
