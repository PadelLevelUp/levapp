/**
 * PAD-415 (messaging.conversation-detail rule 9a) — the "Unread messages"
 * divider's placement, pulled out of the FlatList `renderItem` so the rule
 * ("directly above the frozen first-unread message, this visit only") is
 * testable without mounting the list. Mirrors web's `MessageList`.
 */

/**
 * True when `messageId` is the thread's frozen first-unread message — the
 * row the divider renders directly above. `firstUnreadMessageId` is `null`
 * once nothing is unread (a fresh open, or after everything has been read),
 * which is exactly when no row should carry the divider.
 */
export function isFirstUnreadMessage(
  messageId: string | number,
  firstUnreadMessageId: string | number | null | undefined
): boolean {
  return (
    firstUnreadMessageId != null &&
    String(messageId) === String(firstUnreadMessageId)
  );
}

/**
 * The index in `messages` the divider sits directly above, or -1 when there
 * is none — either nothing is unread, or the first-unread message has not
 * loaded into this page yet (the target-walk machinery fetches older pages
 * until it does, or gives up per `nextTargetStep`'s bound).
 */
export function firstUnreadDividerIndex(
  messages: { id: string | number }[],
  firstUnreadMessageId: string | number | null | undefined
): number {
  if (firstUnreadMessageId == null) return -1;
  return messages.findIndex((m) =>
    isFirstUnreadMessage(m.id, firstUnreadMessageId)
  );
}
