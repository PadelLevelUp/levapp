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


export default function MessagesPage() {
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [mobileView, setMobileView] =
    useState<"list" | "thread">("list");

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
      if (isMobile) setMobileView("thread");
    } finally {
      setThreadLoading(false);
    }
  };

  const handleBack = () => {
    setMobileView("list");
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
              conversations={conversations}
              selectedId={selectedConversation?.id ?? null}
              onSelect={handleSelectConversation}
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
              />
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
