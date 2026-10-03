/**
 * PAD-446 (notifications.waiting-list rule 4, invitations rule 8a): the waiting list is invitation
 * group 0 — asked first, never placed. Shared by web and iOS.
 */
import type { ApprovalQueuePlayer, InviteSimulation, InviteSimulationWaitingListEntry } from "@levelup/types";

/** STUB (red first). */
export function waitingListAskedFirst(
  _simulation: Pick<InviteSimulation, "waitingList">
): InviteSimulationWaitingListEntry[] {
  return [];
}

export type QueueBadge = { text: string } | { key: string; params?: Record<string, number> };

/** STUB (red first). */
export function queueBadgeLabel(
  _player: Pick<ApprovalQueuePlayer, "roundNumber" | "groupIndex" | "groupLabel" | "fromWaitingList">
): QueueBadge | null {
  return null;
}
