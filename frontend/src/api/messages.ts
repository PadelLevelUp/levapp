import type { Conversation, Message } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockConversations } from "@/data/mockData";

export async function getConversations(): Promise<Conversation[]> {
  if (USE_MOCK_DATA) {
    return mockConversations;
  }

  const res = await api.get("/app/conversations");
  // Endpoint is paginated: { conversations: [...], hasMore: boolean }
  return Array.isArray(res.data) ? res.data : (res.data.conversations ?? []);
}

export async function getConversation(
  conversationId: string
): Promise<Conversation> {
  if (USE_MOCK_DATA) {
    const conv = mockConversations.find((c) => c.id === conversationId);
    if (conv) return conv;
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const res = await api.get(`/app/conversation/${conversationId}`);
  return res.data;
}

export async function getUnreadMessagesCount() {
  if (USE_MOCK_DATA) {
    const total = mockConversations.reduce((sum, c) => sum + c.unreadCount, 0);
    return { count: total };
  }

  const res = await api.get(`/app/messages/unread_count`);
  return res.data;
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

  const res = await api.post("/app/message", {
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
  if (USE_MOCK_DATA) {
    console.log("[mock] editMessage", messageId, content);
    return;
  }

  await api.put(`/app/message/${messageId}`, { text: content });
}

export async function deleteMessage(messageId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] deleteMessage", messageId);
    return;
  }

  await api.delete(`/app/message/${messageId}`);
}

export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log("[mock] toggleReaction", messageId, emoji);
    return;
  }

  await api.post(`/app/message/${messageId}/reaction`, { emoji });
}

export async function createConversation(payload: {
  otherParticipants: [string];
}): Promise<Conversation> {
  if (USE_MOCK_DATA) {
    console.log("[mock] createConversation", payload);
    return {
      id: `conv-mock-${Date.now()}`,
      participantId: payload.otherParticipants[0],
      participantName: "New Conversation",
      lastMessage: null,
      lastMessageAt: null,
      unreadCount: 0,
      messages: [],
    };
  }

  const res = await api.post("/app/conversation", {
    otherParticipants: payload.otherParticipants,
  });
  return res.data;
}

export async function markConversationRead(conversationId: string) {
  if (USE_MOCK_DATA) {
    console.log("[mock] markConversationRead", conversationId);
    return;
  }

  await api.post(`/app/conversation/${conversationId}/read`);
}
