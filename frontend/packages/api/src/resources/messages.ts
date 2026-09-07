import type { BlockedUser, Conversation, Message } from "@levelup/types";
import { getApi } from "../client";

export async function getConversations(page = 1, limit = 20): Promise<{ conversations: Conversation[]; hasMore: boolean }> {
  const res = await getApi().get("/app/conversations", { params: { page, limit } });
  return res.data;
}

export async function getConversation(
  conversationId: string
): Promise<Conversation> {
  const res = await getApi().get(`/app/conversation/${conversationId}`);
  return res.data;
}

export async function getUnreadMessagesCount() {
  const res = await getApi().get(`/app/messages/unread_count`);
  return res.data;
}

export async function sendMessage(payload: {
  conversationId: string;
  content: string;
  replyToId?: string;
}): Promise<Message> {
  const res = await getApi().post("/app/message", {
    conversationId: payload.conversationId,
    text: payload.content,
    replyToId: payload.replyToId ?? null,
  });
  return res.data;
}

export async function editMessage(
  messageId: string,
  content: string
): Promise<void> {
  await getApi().put(`/app/message/${messageId}`, { text: content });
}

export async function deleteMessage(messageId: string): Promise<void> {
  await getApi().delete(`/app/message/${messageId}`);
}

export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  await getApi().post(`/app/message/${messageId}/reaction`, { emoji });
}

/**
 * Either a participant id list (coach → roster/club player, student → coach)
 * or — messaging.direct-by-username — an exact username a student types.
 * The two keys are exclusive; the server answers 400 when both are sent.
 */
export type CreateConversationPayload =
  | { otherParticipants: [string]; otherUsername?: never }
  | { otherUsername: string; otherParticipants?: never };

export async function createConversation(
  payload: CreateConversationPayload
): Promise<Conversation> {
  const body =
    "otherUsername" in payload && payload.otherUsername !== undefined
      ? { otherUsername: payload.otherUsername }
      : { otherParticipants: payload.otherParticipants };
  const res = await getApi().post("/app/conversation", body);
  return res.data;
}

export async function markConversationRead(conversationId: string) {
  await getApi().post(`/app/conversation/${conversationId}/read`);
}

export async function blockUser(userId: string): Promise<void> {
  await getApi().post(`/app/users/${userId}/block`);
}

export async function unblockUser(userId: string): Promise<void> {
  await getApi().delete(`/app/users/${userId}/block`);
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const res = await getApi().get("/app/blocked-users");
  return res.data;
}

export async function reportMessage(
  messageId: string,
  reason?: string
): Promise<void> {
  await getApi().post(`/app/messages/${messageId}/report`, { reason });
}
