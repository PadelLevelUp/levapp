/**
 * The unread-count pill (PAD-414 / messaging.conversations rule 16).
 *
 * SINGLE SOURCE OF TRUTH for how the pill reads: the exact number up to 9, and
 * "9+" beyond it, so a coach's list is never crowded by a three-digit badge.
 * Shared by web (`ConversationList`) and iOS (`ConversationItem`) so the two
 * shells cannot drift on the cap.
 */

/**
 * @param count the conversation's `unreadCount`.
 * @returns "" for zero or a negative count (nothing to show — callers gate the
 *   whole pill on `unreadCount > 0` and would not call this for zero, but a
 *   defensive caller gets an empty label rather than "0" or "-1"); the plain
 *   number as a string for 1 through 9; "9+" for 10 and above.
 */
export function unreadBadgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  if (count > 9) return "9+";
  return String(count);
}
