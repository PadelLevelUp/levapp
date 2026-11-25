import { capacityBarOf, confirmedSpotsOf, lightTheme, type PresenceWithPlayerLike } from "@levelup/config";
import * as React from "react";
import { View } from "react-native";
import { ClassFillBar } from "./ClassFillBar";

/**
 * The coach's capacity box fill bar (calendar.event-detail rule 27, UI idea 3), iOS: the calendar
 * card's own `ClassFillBar` under the box's `X/Y`. `filled` is the box's own X, `confirmed` comes
 * from the shared `confirmedSpotsOf`, `capacity` is Y. When it draws is decided by `capacityBarOf`,
 * shared with web. Outside the amber tone it draws in the box's text colour (`foreground`).
 */
export function ClassCapacityBar({
  participants,
  presences,
  capacity,
  filled,
  status,
  ended,
  canManage,
  editing,
}: {
  participants: readonly { id: string | number }[];
  presences: readonly PresenceWithPlayerLike[] | null | undefined;
  capacity: number | null | undefined;
  filled: number;
  status?: string | null;
  ended: boolean;
  canManage: boolean;
  editing: boolean;
}) {
  const bar = capacityBarOf({ capacity, filled, status, ended, canManage, editing });
  if (!bar || !capacity) return null;
  return (
    <View className="mt-1.5 flex-row">
      <ClassFillBar
        confirmed={confirmedSpotsOf(participants, presences)}
        filled={filled}
        capacity={capacity}
        color={lightTheme.foreground}
        tone={bar.tone}
      />
    </View>
  );
}
