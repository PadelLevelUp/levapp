import type { Conversation } from "@/types";

/**
 * messaging.conversations rule 17 (PAD-648): on web the list and the open thread sit side by side,
 * so the conversation open in the pane stays in the "Não lidas" list after it is read — until the
 * pane closes or the filter changes — instead of vanishing under the reader. `pinned` is that
 * row's last listed copy; it goes back, read, in its place by last message.
 */
export function withPinnedRow(
  list: Conversation[],
  pinned: Conversation | null,
  selectedId: string | null
): Conversation[] {
  if (!pinned || selectedId === null) return list;
  const id = String(selectedId);
  if (String(pinned.id) !== id) return list;
  if (list.some((c) => String(c.id) === id)) return list;
  const at = (c: Conversation) => (c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : -Infinity);
  const read = { ...pinned, unreadCount: 0 };
  const index = list.findIndex((c) => at(c) < at(read));
  return index === -1 ? [...list, read] : [...list.slice(0, index), read, ...list.slice(index)];
}
