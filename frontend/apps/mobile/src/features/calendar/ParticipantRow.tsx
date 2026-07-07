import type {
  AbsenceJustification,
  Player,
  Presence,
  PresenceStatus,
} from "@levelup/types";
import * as React from "react";
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

        {presence?.invited ? (
          <Badge variant={presence.confirmed ? "success" : "warning"}>
            <Text>{presence.confirmed ? "Confirmed" : "Invited"}</Text>
          </Badge>
        ) : null}

        {attendance.status === "present" ? (
          <Badge variant="success">
            <Text>Present</Text>
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
                ? "Justified"
                : "Absent"}
            </Text>
          </Badge>
        ) : null}
      </View>

      {canMark ? (
        <View className="flex-row gap-2">
          <Button
            testID={`attendance-present-${playerId}`}
            accessibilityLabel={`Mark ${name} present`}
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
              Present
            </Text>
          </Button>
          <Button
            testID={`attendance-absent-${playerId}`}
            accessibilityLabel={`Mark ${name} absent`}
            variant={attendance.status === "absent" ? "destructive" : "outline"}
            size="sm"
            className="flex-1"
            onPress={() => setStatus("absent")}
          >
            <Text>Absent</Text>
          </Button>
        </View>
      ) : null}

      {canMark && attendance.status === "absent" ? (
        <View className="flex-row gap-2">
          <Button
            testID={`attendance-justified-${playerId}`}
            accessibilityLabel={`Mark ${name} absence justified`}
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
              Justified
            </Text>
          </Button>
          <Button
            testID={`attendance-unjustified-${playerId}`}
            accessibilityLabel={`Mark ${name} absence unjustified`}
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
            <Text className="text-xs">Unjustified</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
