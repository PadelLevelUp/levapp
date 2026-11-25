import { capacityBarOf, confirmedSpotsOf, type PresenceWithPlayerLike } from "@levelup/config";
import { ClassFillBar } from "./ClassFillBar";

/**
 * The coach's capacity box fill bar (calendar.event-detail rule 27, UI idea 3): the calendar card's
 * own `ClassFillBar` under the box's `X/Y`. `filled` is the box's own X, `confirmed` comes from the
 * shared `confirmedSpotsOf`, `capacity` is Y. When it draws is decided by `capacityBarOf`, shared
 * with iOS. The bar is decoration beside the number, so it draws in the box's text colour.
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
    <ClassFillBar
      confirmed={confirmedSpotsOf(participants, presences)}
      filled={filled}
      capacity={capacity}
      tone={bar.tone}
      className="mt-1.5"
    />
  );
}
