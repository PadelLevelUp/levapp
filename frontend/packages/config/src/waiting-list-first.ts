/**
 * PAD-446 (notifications.waiting-list rule 4, invitations rule 8a): the waiting list is invitation
 * group 0 — asked first, never placed. Shared by web and iOS.
 */
import type { ApprovalQueuePlayer, InviteSimulation, InviteSimulationWaitingListEntry } from "@levelup/types";

/**
 * The students the "Understand invites" rehearsal shows as asked first (settings.tutorials rule
 * 4.3), in the server's order. A server older than PAD-446 sends no `waitingList`: nothing is shown
 * (its `waitingListPlacement` claimed a placement that no longer exists).
 */
export function waitingListAskedFirst(
  simulation: Pick<InviteSimulation, "waitingList">
): InviteSimulationWaitingListEntry[] {
  return simulation.waitingList ?? [];
}

export type QueueBadge = { text: string } | { key: string; params?: Record<string, number> };

/**
 * The chip next to a player in the replacement-approval queue (semi-auto-approval rule 5): a
 * waiting-list student first (asked first, whatever their round number), then an explicit
 * `groupLabel`, then the round number, then the group index — nothing when the backend sent none.
 * `groupLabel` is server-authored text and therefore carries no key.
 */
export function queueBadgeLabel(
  player: Pick<ApprovalQueuePlayer, "roundNumber" | "groupIndex" | "groupLabel" | "fromWaitingList">
): QueueBadge | null {
  if (player.fromWaitingList) return { key: "notificationsUi.replacementApproval.waitingList" };
  if (player.groupLabel) return { text: player.groupLabel };
  if (player.roundNumber != null) {
    return { key: "notificationsUi.replacementApproval.round", params: { number: player.roundNumber } };
  }
  if (player.groupIndex != null) {
    return { key: "notificationsUi.replacementApproval.group", params: { index: player.groupIndex } };
  }
  return null;
}
