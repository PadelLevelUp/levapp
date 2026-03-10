import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConversationList } from "@/components/messages/ConversationList";
import { ChatThread } from "@/components/messages/ChatThread";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getConversations,
  getConversation,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  createConversation,
  markConversationRead,
} from "@/api/messages";
import type { Conversation, Message } from "@/types";
import { Button } from "@/components/ui/button";
import {
  LoadingMessages,
  LoadingConversationList,
  LoadingChatThread,
} from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext";
import { createEventSource } from "@/api/events";
import { useLayout } from "@/components/layout/LayoutContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const normalizeConversationId = (
  id: string | number | null | undefined
): string | null => {
  if (id === null || id === undefined) return null;
  return String(id);
};

export default function MessagesPage() {
  const isMobile = useIsMobile();
  const { user, token } = useAuth();
  const { isSupported, permission, isSubscribed, subscribe } = usePushNotifications(token);
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();

  const { setScrollMode, refreshUnreadCount } = useLayout();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const mobileView = id ? "thread" : "list";
  const selectedConversationIdRef = useRef<string | null>(null);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  }, [conversations]);

  const ensureConversationExists = async (conversationId: string) => {
    const convo = await getConversation(conversationId);
    setConversations((prev) => {
      if (prev.some((c) => normalizeConversationId(c.id) === normalizeConversationId(convo.id))) {
        return prev;
      }
      return [convo, ...prev];
    });
  };

  useEffect(() => {
    selectedConversationIdRef.current = normalizeConversationId(selectedConversation?.id);
  }, [selectedConversation]);

  useEffect(() => {
    async function load() {
      try {
        setInitialLoading(true);
        const data = await getConversations();
        setConversations(data);
      } finally {
        setInitialLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!token) return;

    const es = createEventSource(token);

    es.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      // ---------------------------------------------------------------
      // message_created — promote own optimistic message to 'delivered'
      // ---------------------------------------------------------------
      if (data.type === "message_created") {
        const message: Message = data.payload;
        const messageConversationId = normalizeConversationId(message.conversationId);
        if (!messageConversationId) return;

        const isOwnMessage = Number(message.senderId) === Number(user.id);

        await ensureConversationExists(messageConversationId);

        setSelectedConversation((prev) => {
          if (!prev || normalizeConversationId(prev.id) !== messageConversationId) return prev;

          if (isOwnMessage) {
            // Promote the 'sent' optimistic message to 'delivered'
            return {
              ...prev,
              messages: prev.messages.map((m) =>
                String(m.id) === String(message.id)
                  ? { ...m, status: "delivered" as const }
                  : m
              ),
            };
          }

          // Someone else's message — append
          return {
            ...prev,
            messages: [...prev.messages, { ...message, status: "delivered" as const }],
          };
        });

        setConversations((prev) => {
          const existing = prev.find(
            (c) => normalizeConversationId(c.id) === messageConversationId
          );
          if (!existing) return prev;

          const isOpen = selectedConversationIdRef.current === messageConversationId;

          return [
            {
              ...existing,
              lastMessage: message.content,
              lastMessageAt: message.timestamp,
              unreadCount: isOpen
                ? 0
                : isOwnMessage
                ? existing.unreadCount
                : existing.unreadCount + 1,
            },
            ...prev.filter((c) => c.id !== existing.id),
          ];
        });

        const isOpenConversation = selectedConversationIdRef.current === messageConversationId;
        if (isOpenConversation && !isOwnMessage) {
          await markConversationRead(messageConversationId);
        }

        void refreshUnreadCount();
        return;
      }

      // ---------------------------------------------------------------
      // message_edited
      // ---------------------------------------------------------------
      if (data.type === "message_edited") {
        const edited: Message = data.payload;
        setSelectedConversation((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  String(m.id) === String(edited.id)
                    ? { ...m, content: edited.content, edited: true }
                    : m
                ),
              }
            : prev
        );
        return;
      }

      // ---------------------------------------------------------------
      // message_deleted
      // ---------------------------------------------------------------
      if (data.type === "message_deleted") {
        const { id, conversationId } = data.payload;
        setSelectedConversation((prev) =>
          prev && normalizeConversationId(prev.id) === normalizeConversationId(conversationId)
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  String(m.id) === String(id) ? { ...m, isDeleted: true } : m
                ),
              }
            : prev
        );
        return;
      }

      // ---------------------------------------------------------------
      // message_reaction
      // ---------------------------------------------------------------
      if (data.type === "message_reaction") {
        const updated: Message = data.payload;
        setSelectedConversation((prev) =>
          prev && normalizeConversationId(prev.id) === normalizeConversationId(updated.conversationId)
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  String(m.id) === String(updated.id) ? updated : m
                ),
              }
            : prev
        );
        return;
      }
    };

    es.onerror = (err) => {
      console.warn("SSE error", err);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [token, user.id, refreshUnreadCount]);

  useEffect(() => {
    setScrollMode("none");
    return () => setScrollMode("page");
  }, [setScrollMode]);

  const handleSelectConversation = async (conversationId: string) => {
    setThreadLoading(true);
    try {
      const convo = await getConversation(conversationId);
      setSelectedConversation(convo);
      void markConversationRead(convo.id);
      void refreshUnreadCount();
      setConversations((prev) =>
        prev.map((c) =>
          normalizeConversationId(c.id) === normalizeConversationId(convo.id)
            ? { ...c, unreadCount: 0 }
            : c
        )
      );
      navigate(`/messages/${conversationId}`);
    } finally {
      setThreadLoading(false);
    }
  };

  // Auto-load the conversation when navigating directly to /messages/:id (deep link / notification tap)
  useEffect(() => {
    if (!id || normalizeConversationId(selectedConversation?.id) === id) return;
    void handleSelectConversation(id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (initialLoading) {
    return (
      <AppLayout>
        <LoadingMessages />
      </AppLayout>
    );
  }

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  const handleBack = () => {
    navigate("/messages");
  };

  const handleSendMessage = async (content: string, replyToId?: string) => {
    if (!selectedConversation) return;

    // 1. Optimistic insert — status: 'sending'
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      senderId: user.id,
      content,
      timestamp: new Date().toISOString(),
      isRead: false,
      status: "sending",
      replyTo: replyToId ?? null,
      edited: false,
      isDeleted: false,
      reactions: [],
    };

    setSelectedConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev
    );

    try {
      // 2. API resolves — replace temp id with real id, status: 'sent'
      const saved = await sendMessage({
        conversationId: selectedConversation.id,
        content,
        replyToId,
      });

      setSelectedConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === tempId ? { ...saved, status: "sent" as const } : m
              ),
            }
          : prev
      );
    } catch {
      setSelectedConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === tempId ? { ...m, status: "failed" as const } : m
              ),
            }
          : prev
      );
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    // Optimistic
    setSelectedConversation((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((m) =>
              String(m.id) === messageId ? { ...m, content, edited: true } : m
            ),
          }
        : prev
    );
    await editMessage(messageId, content);
  };

  const handleDeleteMessage = (messageId: string) => {
    // Optimistic
    setSelectedConversation((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((m) =>
              String(m.id) === messageId ? { ...m, isDeleted: true } : m
            ),
          }
        : prev
    );
    void deleteMessage(messageId);
  };

  const handleToggleReaction = (messageId: string, emoji: string) => {
    // Not optimistic — SSE message_reaction delivers authoritative state
    void toggleReaction(messageId, emoji);
  };

  const handleNewConversation = async (userId: string) => {
    const existing = conversations.find((c) => c.participantId === userId);
    if (existing) {
      navigate(`/messages/${existing.id}`);
      setSelectedConversation(existing);
      return;
    }
    const newConversation = await createConversation({ otherParticipants: [userId] });
    setConversations((prev) => [newConversation, ...prev]);
    setSelectedConversation(newConversation);
    navigate(`/messages/${newConversation.id}`);
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {isSupported && !isSubscribed && permission !== "denied" && (
          <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Enable message notifications</p>
            <Button size="sm" variant="outline" onClick={() => void subscribe()}>
              Enable
            </Button>
          </div>
        )}
        {isSupported && permission === "denied" && (
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              Notifications blocked. Enable them in browser settings.
            </p>
          </div>
        )}

        <div className="flex h-full">
          {/* Conversation list */}
          <div
            className={
              isMobile
                ? mobileView === "list"
                  ? "block w-full"
                  : "hidden"
                : "block border-r"
            }
          >
            {initialLoading ? (
              <LoadingConversationList />
            ) : (
              <ConversationList
                conversations={sortedConversations}
                selectedId={selectedConversation?.id ?? null}
                onSelect={handleSelectConversation}
                onNewConversation={handleNewConversation}
              />
            )}
          </div>

          {/* Chat thread */}
          <div
            className={
              isMobile
                ? mobileView === "thread"
                  ? "flex flex-1"
                  : "hidden"
                : "flex flex-1"
            }
          >
            <div className="flex flex-col flex-1 min-h-0">
              {threadLoading ? (
                <LoadingChatThread />
              ) : !selectedConversation ? (
                <div className="flex-1 grid place-items-center p-6">
                  <div className="text-center">
                    <p className="font-medium">Select a conversation</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose a chat from the list to see messages.
                    </p>
                  </div>
                </div>
              ) : (
                <ChatThread
                  conversation={selectedConversation}
                  user_id={user.id}
                  onSendMessage={handleSendMessage}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onToggleReaction={handleToggleReaction}
                  onBack={isMobile ? handleBack : undefined}
                  isMobile={isMobile}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
