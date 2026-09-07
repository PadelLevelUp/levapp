import "@/api/client";
import type { BlockedUser, Conversation, Message } from "@/types";
import * as messagesApi from "@levelup/api/src/resources/messages";
import { USE_MOCK_DATA } from "@/config";
import { mockConversations } from "@/data/mockData";

export async function getConversations(page = 1, limit = 20): Promise<{ conversations: Conversation[]; hasMore: boolean }> {
  if (USE_MOCK_DATA) {
    return { conversations: mockConversations, hasMore: false };
  }

  return messagesApi.getConversations(page, limit);
}

export async function getConversation(
  conversationId: string,
  params?: { limit?: number; before?: string | number | null }
): Promise<Conversation> {
  if (USE_MOCK_DATA) {
    const conv = mockConversations.find((c) => c.id === conversationId);
    // PAD-208: the mock thread is short enough to be one page, so there is
    // never anything older behind it — say so rather than leaving `hasMore`
    // undefined, which would leave the top sentinel armed forever.
    if (conv) return { ...conv, hasMore: false, oldestMessageId: conv.messages[0]?.id ?? null };
    throw new Error(`Conversation ${conversationId} not found`);
  }

  return messagesApi.getConversation(conversationId, params);
}

export async function getUnreadMessagesCount() {
  if (USE_MOCK_DATA) {
    const total = mockConversations.reduce((sum, c) => sum + c.unreadCount, 0);
    return { count: total };
  }

  return messagesApi.getUnreadMessagesCount();
}

export async function sendMessage(payload: {
  conversationId: string;
  content: string;
  replyToId?: string;
}): Promise<Message> {
  if (USE_MOCK_DATA) {
    console.log("[mock] sendMessage", payload);
    return {
      id: crypto.randomUUID(),
      senderId: 1,
      content: payload.content,
      timestamp: new Date().toISOString(),
      isRead: true,
      status: "delivered",
      replyTo: payload.replyToId ?? null,
      edited: false,
      isDeleted: false,
      reactions: [],
    };
  }

  return messagesApi.sendMessage(payload);
}

export async function editMessage(
  messageId: string,
  content: string
): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] editMessage", messageId, content);
    return;
  }

  await messagesApi.editMessage(messageId, content);
}

export async function deleteMessage(messageId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteMessage", messageId);
    return;
  }

  await messagesApi.deleteMessage(messageId);
}

export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] toggleReaction", messageId, emoji);
    return;
  }

  await messagesApi.toggleReaction(messageId, emoji);
}

export type { CreateConversationPayload } from "@levelup/api/src/resources/messages";

export async function createConversation(
  payload: messagesApi.CreateConversationPayload
): Promise<Conversation> {
  if (USE_MOCK_DATA) {
    console.log("[mock] createConversation", payload);
    return {
      id: `conv-mock-${Date.now()}`,
      participantId: payload.otherParticipants?.[0] ?? `mock-${payload.otherUsername}`,
      participantName: "New Conversation",
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: 0,
      messages: [],
    };
  }

  return messagesApi.createConversation(payload);
}

export async function markConversationRead(conversationId: string) {
  if (USE_MOCK_DATA) {
    console.log("[mock] markConversationRead", conversationId);
    return;
  }

  await messagesApi.markConversationRead(conversationId);
}

export async function blockUser(userId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] blockUser", userId);
    return;
  }

  await messagesApi.blockUser(userId);
}

export async function unblockUser(userId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] unblockUser", userId);
    return;
  }

  await messagesApi.unblockUser(userId);
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  if (USE_MOCK_DATA) {
    return [];
  }

  return messagesApi.getBlockedUsers();
}

export async function reportMessage(
  messageId: string,
  reason?: string
): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] reportMessage", messageId, reason);
    return;
  }

  await messagesApi.reportMessage(messageId, reason);
}
