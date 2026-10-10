import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
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
  hasConversation,
  mergeConversationPages,
  mergeOlderPage,
  queryKeys,
  threadLoadErrorKey,
  useConversations,
  type ThreadLoadErrorKey,
} from "@levelup/hooks";
import type { Conversation, Message } from "@/types";
import { mergeEditedMessage } from "@levelup/api";
import { Button } from "@/components/ui/button";
import {
  LoadingMessages,
  LoadingConversationList,
  LoadingChatThread,
} from "@/components/ui/loading-skeleton";
import { useAuth } from "@/auth/AuthContext";
import { subscribeAppEvents } from "@/api/events";
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
  // PAD-568: only a student is ever offered the connect-with-a-coach shortcut.
  const canConnectWithCoach = !(user?.roles?.includes("coach") ?? false);
  const { isSupported, permission, isSubscribed, subscribe } = usePushNotifications(token);
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  // PAD-408 (messaging.push-notifications rule 12): a push names the message to
  // land on; dropped from the URL once landed so a reload opens at the newest.
  const [searchParams, setSearchParams] = useSearchParams();
  const targetMessageId = searchParams.get("message");
  const handleTargetConsumed = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("message");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);
  // PAD-284 (dashboard.blocks rule 10): a reply card used to send
  // `/messages?conversationId=<id>`, which this page ignored — the message
  // never opened. The server now emits `/messages/<id>`; the old shape is
  // still honoured here so a cached payload lands on the thread too.
  const location = useLocation();
  useEffect(() => {
    const legacy = new URLSearchParams(location.search).get("conversationId");
    if (!id && legacy) navigate(`/messages/${legacy}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, location.search]);

  const { setScrollMode, refreshUnreadCount } = useLayout();

  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  // PAD-415 (messaging.conversation-detail rule 9a): the open response's
  // firstUnreadMessageId, frozen for this visit — the follow-up
  // markConversationRead call clears it server-side, so a later refetch of
  // this same conversation would read back null. Captured once per open,
  // before that call, in handleSelectConversation.
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<
    string | number | null
  >(null);

  const [threadLoading, setThreadLoading] = useState(false);
  // D137: why the last thread open failed; a 403 names another account.
  const [threadError, setThreadError] = useState<ThreadLoadErrorKey | null>(null);
  // client.query-cache rule 6: page 1 of the list is a query (a return inside the stale window
  // renders from cache); pages 2+ are fetched on "load more" and appended here, as before.
  const listQuery = useConversations(1);
  const initialLoading = listQuery.isPending;
  const [extraPages, setExtraPages] = useState<Conversation[]>([]);
  const [extraHasMore, setExtraHasMore] = useState<boolean | null>(null);
  // Safe across a page-1 refetch: once a later page was loaded, that page's own `hasMore` rules
  // (page 1's flag only says whether page 2 exists, which is already answered).
  const hasMore = extraHasMore ?? listQuery.data?.hasMore ?? true;
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  // PAD-208 — one page of older messages at a time (conversation-detail rule 11).
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const mobileView = id ? "thread" : "list";
  const selectedConversationIdRef = useRef<string | null>(null);

  // Page 1 (the query) wins over a later page's copy of the same row: it is the fresher read.
  const conversations = useMemo(
    () =>
      mergeConversationPages(
        listQuery.data?.conversations ?? [],
        [extraPages],
        normalizeConversationId
      ),
    [listQuery.data, extraPages]
  );

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });
  }, [conversations]);

  // Page-1 cache edits: a row changed or created on this device shows at once; the server's list
  // replaces it on the next refetch. Rows on later pages are patched in `extraPages`.
  const patchConversationList = useCallback(
    (update: (list: Conversation[]) => Conversation[]) => {
      queryClient.setQueryData<{ conversations: Conversation[]; hasMore: boolean }>(
        queryKeys.conversations(1),
        (old) => (old ? { ...old, conversations: update(old.conversations) } : old)
      );
    },
    [queryClient]
  );
  const markListRowRead = useCallback(
    (conversationId: string | number) => {
      const same = (c: Conversation) =>
        normalizeConversationId(c.id) === normalizeConversationId(conversationId);
      patchConversationList((list) => list.map((c) => (same(c) ? { ...c, unreadCount: 0 } : c)));
      setExtraPages((prev) => prev.map((c) => (same(c) ? { ...c, unreadCount: 0 } : c)));
    },
    [patchConversationList]
  );
  const addListRow = useCallback(
    (conversation: Conversation) => {
      patchConversationList((list) =>
        hasConversation(list, conversation.id, normalizeConversationId)
          ? list
          : [conversation, ...list]
      );
    },
    [patchConversationList]
  );

  useEffect(() => {
    selectedConversationIdRef.current = normalizeConversationId(selectedConversation?.id);
  }, [selectedConversation]);

  const loadMoreConversations = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getConversations(nextPage);
      setExtraPages((prev) => mergeConversationPages(prev, [result.conversations], normalizeConversationId));
      setPage(nextPage);
      setExtraHasMore(result.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  useEffect(() => {
    if (!token) return;

    // messaging.sse-realtime rule 15 (PAD-277): the tab's one shared stream.
    return subscribeAppEvents(token, async (data) => {

      // ---------------------------------------------------------------
      // message_created — promote own optimistic message to 'delivered'
      // ---------------------------------------------------------------
      if (data.type === "message_created") {
        const message: Message = data.payload;
        const messageConversationId = normalizeConversationId(message.conversationId);
        if (!messageConversationId) return;

        const isOwnMessage = Number(message.senderId) === Number(user.id);

        setSelectedConversation((prev) => {
          if (!prev || normalizeConversationId(prev.id) !== messageConversationId) return prev;
          // PAD-208 rule 10 — the arrival goes onto the newest page, which is
          // the tail of the array; the older pages above it are untouched, and
          // whether the viewport follows is MessageList's decision, not this
          // one's. Shared with iOS so the two shells cannot drift on it.
          return applyIncomingMessage(prev, message);
        });

        // client.query-cache rule 8: a live message invalidates the list (one refetch of the
        // conversations key) instead of probing the conversation for a row to patch. The mark-read
        // of an open thread goes first, so the refetch reads the server's cleared unread count.
        const isOpenConversation = selectedConversationIdRef.current === messageConversationId;
        try {
          if (isOpenConversation && !isOwnMessage) {
            await markConversationRead(messageConversationId);
          }
        } finally {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }

        void refreshUnreadCount();
        return;
      }

      // ---------------------------------------------------------------
      // message_edited
      // ---------------------------------------------------------------
      if (data.type === "message_edited") {
        const edited: Message = data.payload;
        // messaging.sse-realtime rule 18 (PAD-563): the metadata rides along, so a retired,
        // withdrawn or coach-answered invite bubble changes without a reload.
        setSelectedConversation((prev) =>
          prev
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  String(m.id) === String(edited.id) ? mergeEditedMessage(m, edited) : m
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
    });
  }, [token, user.id, refreshUnreadCount, queryClient]);

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
    setThreadError(null);
    try {
      const convo = await getConversation(conversationId, {
        // PAD-224 rule 9 — the open is a smaller page than a walk-back page, so
        // both shells agree on what "the first page" means.
        limit: CONVERSATION_FIRST_PAGE_SIZE,
      });
      setSelectedConversation(convo);
      // PAD-415 rule 9a: captured from THIS response, before the mark-read
      // call below clears it server-side — a later refetch of the same
      // conversation would otherwise read back null.
      setFirstUnreadMessageId(convo.firstUnreadMessageId ?? null);
      // Awaited, not fire-and-forget: refreshUnreadCount re-queries the
      // server, so firing it alongside an uncommitted mark-read races it and
      // can read back the pre-read count — which would leave both the nav
      // badge and the app-icon badge stale.
      await markConversationRead(convo.id);
      void refreshUnreadCount();
      markListRowRead(convo.id);
      // PAD-408: opening the thread already in the URL (a deep link, a push)
      // keeps its `?message=` target; choosing another thread drops it.
      navigate({
        pathname: `/messages/${conversationId}`,
        search: id === conversationId ? location.search : "",
      });
    } catch (error) {
      // D137: the fetch failed (a 403 when a notification belongs to another
      // account); show why in the thread pane instead of nothing at all.
      setSelectedConversation(null);
      setFirstUnreadMessageId(null);
      setThreadError(threadLoadErrorKey(error));
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
    addListRow(newConversation);
    setSelectedConversation(newConversation);
    navigate(`/messages/${newConversation.id}`);
  };

  // messaging.direct-by-username: a student reaches another student by exact
  // username. The server resolves it (find-or-create by participant key), so
  // an existing thread comes back as-is; errors propagate to the dialog,
  // which renders the 404 inline.
  const handleNewConversationByUsername = async (username: string) => {
    const conversation = await createConversation({ otherUsername: username });
    addListRow(conversation);
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
        {/* PAD-195: this banner is about BROWSER alerts only. The conversation
            list, the SSE live updates and the unread badge never depended on
            the permission, but the old copy ("Notifications blocked. Enable
            them in browser settings.") read as "this app has stopped
            notifying you" — a coach with push blocked reported exactly that.
            The copy now says what is off and what still works
            (messaging.push-notifications rule 8). */}
        {isSupported && permission === "denied" && (
          <div
            data-testid="push-blocked-banner"
            className="px-3 py-2 border-b border-border bg-muted/30"
          >
            <p className="text-xs text-muted-foreground">
              {t("messages.notificationsBlocked")}
            </p>
          </div>
        )}

        {/* PAD-417 (B-198): the panes take what the banner leaves. `h-full` asked for
            100% of the column on top of the banner, and a conversation list taller than
            the pane holds the row at that size (its automatic minimum), so the composer
            ended past <main>'s clip. `flex-1 min-h-0` lets the row shrink. */}
        <div className="flex flex-1 min-h-0">
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
                // PAD-568: a student with no linked coach is sent to "Connect with a coach"
                // (players.join-token rule 8); coaches never see the shortcut.
                onConnectWithCoach={canConnectWithCoach ? () => navigate("/connect") : undefined}
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
              ) : !selectedConversation && threadError ? (
                <div className="flex-1 grid place-items-center p-6" data-testid="thread-load-error">
                  <p className="font-medium text-center">{t(threadError)}</p>
                </div>
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
                  targetMessageId={targetMessageId}
                  onTargetConsumed={handleTargetConsumed}
                  firstUnreadMessageId={firstUnreadMessageId}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}