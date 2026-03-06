import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConversationList } from "@/components/messages/ConversationList";
import { ChatThread } from "@/components/messages/ChatThread";
import { useIsMobile } from "@/hooks/use-mobile";
import { getConversations, getConversation } from "@/api/messages";
import type { Conversation } from "@/types";
import { Button } from "@/components/ui/button";
import {
  LoadingMessages,
  LoadingConversationList,
  LoadingChatThread,
} from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext"
import { sendMessage, createConversation, markConversationRead } from "@/api/messages";
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

  const { setScrollMode, refreshUnreadCount } = useLayout();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [mobileView, setMobileView] =
    useState<"list" | "thread">("list");
  const selectedConversationIdRef = useRef<string | null>(null);

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;

      return (
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
      );
    });
  }, [conversations]);

  const ensureConversationExists = async (conversationId: string) => {
    setConversations((prev) => {
      if (prev.some((c) => normalizeConversationId(c.id) === conversationId)) {
        return prev;
      }
      return prev;
    });

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
      if (data.type !== "message_created") return;

      const message = data.payload;
      const messageConversationId = normalizeConversationId(message.conversationId);
      if (!messageConversationId) return;
      const isOwnMessage = Number(message.senderId) === Number(user.id);

      await ensureConversationExists(messageConversationId);

      setSelectedConversation((prev) => {

        if (!prev) return prev;

        if (normalizeConversationId(prev.id) !== messageConversationId) {
          return prev;
        }

      return {
        ...prev,
        messages: [...prev.messages, message],
      };
      });

      setConversations((prev) => {
        const existing = prev.find(
          (c) => normalizeConversationId(c.id) === messageConversationId
        );

        if (!existing) return prev;

        const isOpen =
          selectedConversationIdRef.current === messageConversationId;

        const updatedConversation = {
          ...existing,
          lastMessage: message.content,
          lastMessageAt: message.timestamp,
          unreadCount: isOpen
            ? 0
            : (isOwnMessage ? existing.unreadCount : existing.unreadCount + 1),
        };

        return [
          updatedConversation,
          ...prev.filter((c) => c.id !== existing.id),
        ];
      });

      const isOpenConversation =
        selectedConversationIdRef.current === messageConversationId;
      if (isOpenConversation && !isOwnMessage) {
        void markConversationRead(messageConversationId);
      }

      void refreshUnreadCount();
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

  if (initialLoading) {
    return (
      <AppLayout>
        <LoadingMessages />
      </AppLayout>
    );
  }

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

      if (isMobile) setMobileView("thread");
    } finally {
      setThreadLoading(false);
    }
  };

  const handleBack = () => {
    setMobileView("list");
  };

  const handleSendMessage = async (content: string) => {
    if (!selectedConversation) return;

    await sendMessage({
      conversationId: selectedConversation.id,
      content,
    });
  };

  const handleNewConversation = async (userId: string) => {
    const existing = conversations.find(c => c.participantId === userId);
    if (existing) {
      setSelectedConversation(existing);
      return;
    }

    const newConversation = await createConversation({
      otherParticipants : [userId]
    })

    setConversations(prev => [newConversation, ...prev]);
    setSelectedConversation(newConversation);
  };

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
        {isSupported && isSubscribed && (
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">Notifications on ✓</p>
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
