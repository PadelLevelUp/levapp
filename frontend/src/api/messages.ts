import type { Conversation, Message } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

export async function getConversations(
    userId: number,
): Promise<Conversation[]> {
  const res = await fetch(
    `${API_URL}/api/app/conversations?user_id=${userId}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getConversation(
  userId: number,
  conversationId: string,
): Promise<Conversation> {
  const res = await fetch(
    `${API_URL}/api/app/conversation/${conversationId}?user_id=${userId}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function sendMessage(payload: {
  conversationId: string;
  senderId: number;
  content: string;
}): Promise<Message> {
  const res = await fetch(`${API_URL}/api/app/message`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: payload.conversationId,
      sender_id: payload.senderId,
      text: payload.content,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}
