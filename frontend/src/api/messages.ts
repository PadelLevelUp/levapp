import type { Conversation, Message } from "@/types";
import { api } from "@/api/client";

export async function getConversations(): Promise<Conversation[]> {
  const res = await api.get("/api/app/conversations");
  return res.data;
}

export async function getConversation(
  conversationId: string
): Promise<Conversation> {
  const res = await api.get(`/api/app/conversation/${conversationId}`);
  return res.data;
}

export async function getUnreadMessagesCount() {
  const res = await api.get(`/api/app/messages/unread_count`);
  return res.data;
}

export async function sendMessage(payload: {
  conversationId: string;
  content: string;
}): Promise<Message> {
  const res = await api.post("/api/app/message", {
    conversationId: payload.conversationId,
    text: payload.content,
  });

  return res.data;
}

export async function createConversation(payload: {
  otherParticipants: [string];
}): Promise<Conversation> {
  const res = await api.post("/api/app/conversation", {
    otherParticipants: payload.otherParticipants,
  });

  return res.data;
}

export async function markConversationRead(conversationId: string) {
  await api.post(`/api/app/conversation/${conversationId}/read`);
}