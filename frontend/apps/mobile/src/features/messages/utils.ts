import type { Conversation, Message } from "@levelup/types";
import { queryKeys } from "@levelup/hooks";
import type { QueryClient } from "@tanstack/react-query";
import { format, isThisYear, isToday, isYesterday } from "date-fns";

/** Normalizes a conversation id (backend mixes string/number) to a string. */
export function normalizeId(
  id: string | number | null | undefined
): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

/**
 * Applies `updater` to the cached conversation (queryKeys.conversation).
 * No-op when the conversation isn't cached yet.
 */
export function updateConversationCache(
  queryClient: QueryClient,
  conversationId: string,
  updater: (conversation: Conversation) => Conversation
): void {
  queryClient.setQueryData<Conversation>(
    queryKeys.conversation(conversationId),
    (prev) => (prev ? updater(prev) : prev)
  );
}

/** Replaces or updates a single message inside the cached conversation. */
export function updateMessageInCache(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string | number,
  updater: (message: Message) => Message
): void {
  updateConversationCache(queryClient, conversationId, (conversation) => ({
    ...conversation,
    messages: conversation.messages.map((m) =>
      String(m.id) === String(messageId) ? updater(m) : m
    ),
  }));
}

/** Invalidate every messages-related list query (badge + conversation list). */
export function invalidateMessagesLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });
  void queryClient.invalidateQueries({ queryKey: ["conversations"] });
}

/** In-bubble timestamp, local timezone (PAD-33). */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "HH:mm");
}

/** Conversation-list timestamp: time today, "Yesterday", else a short date. */
export function formatConversationTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  if (isThisYear(date)) return format(date, "d MMM");
  return format(date, "d MMM yyyy");
}

/** Initials for avatar fallbacks. */
export function initialsOf(name: string | undefined | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
