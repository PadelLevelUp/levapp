import type { Conversation, Message } from "@levelup/types";
import { queryKeys } from "@levelup/hooks";
import type { QueryClient } from "@tanstack/react-query";
import type { Locale } from "date-fns";
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

type ConversationTimeOptions = {
  /** date-fns locale for the month name — from `useDateLocale()`. */
  locale: Locale;
  /** Already-translated "yesterday" label, e.g. `t("messages.yesterday")`. */
  yesterdayLabel: string;
};

/**
 * Conversation-list timestamp: time today, "yesterday", else a short date.
 *
 * PAD-157: both locale-dependent pieces are supplied by the caller and neither
 * has a default. The label used to be a hardcoded English "Yesterday" and the
 * month came out en-US on a Portuguese device; requiring them here means a new
 * call site cannot quietly reintroduce either. Keeping the helper pure (no
 * `t()`, no i18n import) is also what keeps it unit-testable.
 */
export function formatConversationTime(
  iso: string | null,
  { locale, yesterdayLabel }: ConversationTimeOptions
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  // HH:mm carries no locale-dependent token, so it needs no locale.
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return yesterdayLabel;
  if (isThisYear(date)) return format(date, "d MMM", { locale });
  return format(date, "d MMM yyyy", { locale });
}

/** Backend role enum → `messages.role*` translation key, or null if unknown. */
const ROLE_LABEL_KEYS: Record<string, string> = {
  coach: "messages.roleCoach",
  player: "messages.rolePlayer",
  assistant: "messages.roleAssistant",
};

/**
 * Translation key for a conversation participant's role (PAD-158).
 *
 * The conversation list used to print the raw backend enum with a `capitalize`
 * class, so a Portuguese device read "Player". Mirrors web's `getRoleLabel`
 * (ChatHeader.tsx), including its case-insensitivity and its fallback: an
 * unrecognised role returns null rather than a key, because `t()` on a missing
 * key renders the key path itself ("messages.roleReferee") — worse than the
 * untranslated word. Callers show the raw role in that case, as web does.
 */
export function roleLabelKey(
  role: string | null | undefined
): string | null {
  if (!role) return null;
  return ROLE_LABEL_KEYS[role.toLowerCase()] ?? null;
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
