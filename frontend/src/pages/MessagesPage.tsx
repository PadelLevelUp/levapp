import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ConversationList } from "@/components/messages/ConversationList";
import { ChatThread } from "@/components/messages/ChatThread";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { getConversations, getConversation } from "@/api/messages";
import type { Conversation } from "@/types";
import {
  LoadingMessages,
  LoadingConversationList,
  LoadingChatThread,
} from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext"
import { sendMessage, createConversation, markConversationRead } from "@/api/messages";
import { createEventSource } from "@/api/events";


export default function MessagesPage() {
  const isMobile = useIsMobile();
  const { user, token, logout } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [mobileView, setMobileView] =
    useState<"list" | "thread">("list");

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
      if (prev.some((c) => c.id === conversationId)) {
        return prev;
      }
      return prev;
    });

    const convo = await getConversation(conversationId);

    setConversations((prev) => {
      if (prev.some((c) => c.id === convo.id)) {
        return prev;
      }

      return [convo, ...prev];
    });
  };

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

      await ensureConversationExists(message.conversationId);

      setSelectedConversation((prev) => {

        if (!prev) return prev;

        if (prev.id !== message.conversationId) {
          return prev;
        }

      return {
        ...prev,
        messages: [...prev.messages, message],
      };
      });

      setConversations((prev) => {
        const existing = prev.find(
          (c) => c.id === message.conversationId
        );

        if (!existing) return prev;

        const isOpen =
          selectedConversation?.id === message.conversationId;

        console.log(message)
        console.log(message.timestamp)
        console.log(new Date(message.timestamp).toLocaleTimeString(
            [],
            { hour: "2-digit", minute: "2-digit" }
          ))

        const updatedConversation = {
          ...existing,
          lastMessage: message.content,
          lastMessageAt: message.timestamp,
          unreadCount: isOpen
            ? 0
            : existing.unreadCount + 1,
        };

        return [
          updatedConversation,
          ...prev.filter((c) => c.id !== existing.id),
        ];
      });

      if (selectedConversation?.id === message.conversationId) {
        markConversationRead(message.conversationId);
      }
    };

    es.onerror = (err) => {
      console.warn("SSE error", err);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [token]);

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
      markConversationRead(convo.id);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convo.id
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

    const message = await sendMessage({
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
          <div className="flex flex-col flex-1">
            {isMobile && (
              <div className="p-3 border-b border-border bg-card">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </div>
            )}

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
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
