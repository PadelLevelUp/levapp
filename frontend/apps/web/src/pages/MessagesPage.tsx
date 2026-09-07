import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import {
  CONVERSATION_FIRST_PAGE_SIZE,
  CONVERSATION_PAGE_SIZE,
  applyIncomingMessage,
  mergeOlderPage,
} from "@levelup/hooks";
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
  const { t } = useTranslation();
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
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  // PAD-208 — one page of older messages at a time (conversation-detail rule 11).
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
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
    // Only the summary is wanted here — a row for the sidebar — so ask for the
    // smallest page there is rather than the thread (PAD-208 rule 1).
    const convo = await getConversation(conversationId, { limit: 1 });
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
        const result = await getConversations(1);
        setConversations(result.conversations);
        setHasMore(result.hasMore);
        setPage(1);
      } finally {
        setInitialLoading(false);
      }
    }
    load();
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getConversations(nextPage);
      setConversations(prev => {
        const existingIds = new Set(prev.map(c => normalizeConversationId(c.id)));
        const fresh = result.conversations.filter(c => !existingIds.has(normalizeConversationId(c.id)));
        return [...prev, ...fresh];
      });
      setPage(nextPage);
      setHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

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
          // PAD-208 rule 10 — the arrival goes onto the newest page, which is
          // the tail of the array; the older pages above it are untouched, and
          // whether the viewport follows is MessageList's decision, not this
          // one's. Shared with iOS so the two shells cannot drift on it.
          return applyIncomingMessage(prev, message);
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

  /**
   * PAD-208 rule 11 — fetch the page before the oldest loaded message and
   * prepend it. The scroll compensation is MessageList's; this only owns the
   * data. `loadingOlderRef` guards the request because the top sentinel can
   * fire again before the `loadingOlder` state has re-rendered.
   */
  const handleLoadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return;

    const current = selectedConversation;
    if (!current || current.hasMore !== true) return;
    const before = current.oldestMessageId ?? current.messages[0]?.id;
    if (before == null) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const older = await getConversation(String(current.id), {
        limit: CONVERSATION_PAGE_SIZE,
        before,
      });
      setSelectedConversation((prev) =>
        // Re-read from state rather than from `current`: a message may have
        // arrived over SSE while this page was in flight.
        prev && normalizeConversationId(prev.id) === normalizeConversationId(current.id)
          ? mergeOlderPage(prev, older)
          : prev
      );
    } catch {
      // Leave `hasMore` alone — the next scroll to the top retries. A failed
      // page must not read as the end of the history.
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [selectedConversation]);

  const handleSelectConversation = async (conversationId: string) => {
    setThreadLoading(true);
    try {
      const convo = await getConversation(conversationId, {
        // PAD-224 rule 9 — the open is a smaller page than a walk-back page, so
        // both shells agree on what "the first page" means.
        limit: CONVERSATION_FIRST_PAGE_SIZE,
      });
      setSelectedConversation(convo);
      // Awaited, not fire-and-forget: refreshUnreadCount re-queries the
      // server, so firing it alongside an uncommitted mark-read races it and
      // can read back the pre-read count — which would leave both the nav
      // badge and the app-icon badge stale.
      await markConversationRead(convo.id);
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
    try {
      await editMessage(messageId, content);
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
    } catch {
      // SSE will deliver the authoritative state
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
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
    } catch {
      // SSE will deliver the authoritative state
    }
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

  // messaging.direct-by-username: a student reaches another student by exact
  // username. The server resolves it (find-or-create by participant key), so
  // an existing thread comes back as-is; errors propagate to the dialog,
  // which renders the 404 inline.
  const handleNewConversationByUsername = async (username: string) => {
    const conversation = await createConversation({ otherUsername: username });
    setConversations((prev) =>
      prev.some((c) => c.id === conversation.id)
        ? prev
        : [conversation, ...prev]
    );
    setSelectedConversation(conversation);
    navigate(`/messages/${conversation.id}`);
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {isSupported && !isSubscribed && permission !== "denied" && (
          <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("messages.enableNotificationsPrompt")}</p>
            <Button size="sm" variant="outline" onClick={() => void subscribe()}>
              {t("messages.enable")}
            </Button>
          </div>
        )}
        {isSupported && permission === "denied" && (
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {t("messages.notificationsBlocked")}
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
                onNewConversationByUsername={handleNewConversationByUsername}
                onLoadMore={loadMoreConversations}
                hasMore={hasMore}
                loadingMore={loadingMore}
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
                    <p className="font-medium">{t("messages.selectConversation")}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("messages.selectConversationHint")}
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
                  hasMore={selectedConversation.hasMore}
                  loadingOlder={loadingOlder}
                  onLoadOlder={handleLoadOlder}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}