import { Ionicons } from "@expo/vector-icons";
import { classRequestsApi, messagesApi, notificationEngineApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import {
  CONVERSATION_FIRST_PAGE_SIZE,
  applyIncomingMessage,
  queryKeys,
  shouldShowJumpToBottom,
  useConversationThread,
} from "@levelup/hooks";
import type { Message } from "@levelup/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { useKeyboardVisible } from "@/hooks/useKeyboardVisible";
import { ErrorState } from "@/components/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { MessageBubble } from "@/features/messages/components/message-bubble";
import { ChatMoreOptionsMenu } from "@/features/messages/components/chat-more-options-menu";
import {
  MessageContextMenu,
  type ContextMenuAnchor,
} from "@/features/messages/components/message-context-menu";
import { ReportMessageDialog } from "@/features/messages/components/report-message-dialog";
import { UnknownSenderBanner } from "@/features/messages/components/unknown-sender-banner";
import { NotificationsBlockedBanner } from "@/features/notifications/notifications-blocked-banner";
import { reminderResponseOutcome } from "@/features/messages/reminder-state";
import {
  anchorReducer,
  initialAnchorState,
  type AnchorEvent,
} from "@/features/messages/anchor-state";
import { isAtBottomOf } from "@/features/messages/scroll-position";
import { composerBottomPadding } from "@/features/messages/composer-padding";
import { waitingListResponseOutcome } from "@/features/messages/waiting-list-state";
import {
  invalidateMessagesLists,
  messageCopyText,
  normalizeId,
  roleLabelKey,
  updateConversationCache,
  updateMessageInCache,
} from "@/features/messages/utils";
import { useAppEvents } from "@/lib/sse";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

/**
 * How long the thread may stay hidden waiting to be anchored (PAD-224 rule 9).
 *
 * A backstop, not a schedule. It is generous on purpose: an earlier 300ms
 * version of this constant *pre-empted* the observations it exists to back up.
 * Instrumenting the reducer on a simulator showed the whole event trace for
 * opening a 200-message thread as `reset → data(30) → fallback` — the native
 * `onLayout` and `onContentSizeChange` callbacks had not arrived yet, so the
 * timer revealed a list still sitting at offset 0 and the thread opened on
 * message 171 of 200. The real observations land in tens of milliseconds once
 * the native side reports; the only thing this bound must prevent is a
 * permanently blank thread when they never do.
 */
const ANCHOR_FALLBACK_MS = 2500;

function ChatSkeleton() {
  return (
    <View className="flex-1 justify-end gap-3 p-4">
      <Skeleton className="h-10 w-48 self-start rounded-2xl" />
      <Skeleton className="h-10 w-56 self-end rounded-2xl" />
      <Skeleton className="h-10 w-40 self-start rounded-2xl" />
      <Skeleton className="h-10 w-52 self-end rounded-2xl" />
    </View>
  );
}

export default function ConversationScreen() {
  const { t } = useTranslation();
  // Pushed route (no tab bar): the composer must clear the home indicator —
  // but only while the keyboard is down. An open keyboard already covers that
  // area, so keeping the inset leaves a visible band above it (PAD-145). The
  // row's own 12pt padding is symmetric; this is only the extra inset under it.
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const composerPaddingBottom = composerBottomPadding(
    keyboardVisible,
    insets.bottom
  );
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = String(params.id);
  const { user } = useAuth();
  const myId = Number(user?.id);
  const queryClient = useQueryClient();

  const {
    data: conversation,
    isLoading,
    isError,
    refetch,
    hasMore,
    isLoadingOlder,
    loadOlder,
  } = useConversationThread(conversationId);

  const [draft, setDraft] = React.useState("");
  const [contextMenu, setContextMenu] = React.useState<{
    message: Message;
    anchor: ContextMenuAnchor;
  } | null>(null);
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null);
  const [editing, setEditing] = React.useState<Message | null>(null);
  const [editText, setEditText] = React.useState("");
  const [confirmingDelete, setConfirmingDelete] = React.useState<Message | null>(
    null
  );
  const [sending, setSending] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [blockedUserIds, setBlockedUserIds] = React.useState<Set<string>>(
    new Set()
  );
  const [confirmingToggleBlock, setConfirmingToggleBlock] = React.useState(false);
  const [togglingBlock, setTogglingBlock] = React.useState(false);
  const [reportMessageId, setReportMessageId] = React.useState<
    string | number | null
  >(null);
  // messaging.block-and-report rules 7–9 (PAD-215): banner state. `repliedLocally`
  // hides the banner as soon as the viewer sends something, without a refetch.
  const [reportFromBanner, setReportFromBanner] = React.useState(false);
  const [repliedLocally, setRepliedLocally] = React.useState(false);
  React.useEffect(() => {
    setRepliedLocally(false);
    setReportFromBanner(false);
  }, [conversationId]);
  const [highlightedId, setHighlightedId] = React.useState<
    string | number | null
  >(null);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  React.useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  // Mark the conversation read once per open (clears badge + list count).
  const markedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!conversation || markedRef.current === conversationId) return;
    markedRef.current = conversationId;
    messagesApi
      .markConversationRead(conversationId)
      .then(() => invalidateMessagesLists(queryClient))
      .catch(() => undefined);
  }, [conversation, conversationId, queryClient]);

  // ── Block state: who has the current user blocked? ──
  const participantId = conversation?.participantId
    ? String(conversation.participantId)
    : null;
  const isBlocked = participantId ? blockedUserIds.has(participantId) : false;
  const showUnknownSender =
    !!conversation &&
    conversation.isKnownContact === false &&
    !repliedLocally &&
    !isBlocked &&
    !conversation.isAssistant &&
    !!participantId;

  const blockFromBanner = async () => {
    if (!participantId) return;
    await messagesApi.blockUser(participantId);
    setBlockedUserIds((prev) => new Set(prev).add(participantId));
  };

  // PAD-203: `participantName` is null once the counterpart is gone
  // (messaging.conversations rule 10) — a different thing from "not loaded
  // yet", which is what `conversationFallback` means. The server sends no
  // display string because it has no i18n, so the label is resolved here.
  // Mirrors web's ChatThread/ChatHeader.
  const participantName = conversation
    ? conversation.participantName ?? t("messages.deletedUser")
    : t("messages.conversationFallback");

  React.useEffect(() => {
    let cancelled = false;
    messagesApi
      .getBlockedUsers()
      .then((list) => {
        if (!cancelled) {
          setBlockedUserIds(new Set(list.map((u) => String(u.id))));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [participantId]);

  const handleConfirmToggleBlock = async () => {
    if (!participantId || togglingBlock) return;
    setTogglingBlock(true);
    try {
      if (isBlocked) {
        await messagesApi.unblockUser(participantId);
        setBlockedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(participantId);
          return next;
        });
        toast.success(t("messages.unblockSuccess"));
      } else {
        await messagesApi.blockUser(participantId);
        setBlockedUserIds((prev) => new Set(prev).add(participantId));
        toast.success(t("messages.blockSuccess"));
      }
      setConfirmingToggleBlock(false);
    } catch {
      toast.error(
        t(isBlocked ? "messages.unblockFailed" : "messages.blockFailed")
      );
    } finally {
      setTogglingBlock(false);
    }
  };

  // Most recent message from the other participant — target for the header's
  // "Report" action (deep-links to reporting that message).
  const lastParticipantMessageId = React.useMemo(() => {
    if (!conversation) return null;
    const messages = conversation.messages;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (Number(messages[i].senderId) !== myId) {
        return messages[i].id;
      }
    }
    return null;
  }, [conversation, myId]);

  // ── Live updates over SSE ──
  useAppEvents(
    React.useCallback(
      (evt) => {
        if (evt.type === "message_created") {
          const message = evt.payload as Message;
          if (normalizeId(message.conversationId) !== conversationId) return;
          const own = Number(message.senderId) === myId;
          // PAD-208 rule 10 — the arrival lands on the newest page, which is the
          // tail of the array; the older pages above it do not move. Shared with
          // web (`applyIncomingMessage`) so the two shells cannot drift.
          updateConversationCache(queryClient, conversationId, (c) =>
            applyIncomingMessage(c, message)
          );
          if (!own && !atBottomRef.current) {
            // Rule 10's unseen flag, which rule 12's control also reads — set
            // through the helper so the ref, the label and the button's
            // visibility cannot drift apart.
            hasNewBelowRef.current = true;
            setHasNewBelow(true);
            setShowJumpToBottom(true);
          }
          if (!own) void messagesApi.markConversationRead(conversationId);
          invalidateMessagesLists(queryClient);
          return;
        }

        if (evt.type === "message_edited") {
          const edited = evt.payload as Message;
          if (normalizeId(edited.conversationId) !== conversationId) return;
          updateMessageInCache(queryClient, conversationId, edited.id, (m) => ({
            ...m,
            content: edited.content,
            edited: true,
          }));
          return;
        }

        if (evt.type === "message_deleted") {
          const payload = evt.payload as {
            id: string | number;
            conversationId?: string | number;
          };
          if (
            payload.conversationId !== undefined &&
            normalizeId(payload.conversationId) !== conversationId
          ) {
            return;
          }
          updateMessageInCache(queryClient, conversationId, payload.id, (m) => ({
            ...m,
            isDeleted: true,
          }));
          return;
        }

        if (evt.type === "message_reaction") {
          const updated = evt.payload as Message;
          if (normalizeId(updated.conversationId) !== conversationId) return;
          updateMessageInCache(
            queryClient,
            conversationId,
            updated.id,
            () => updated
          );
        }
      },
      [conversationId, myId, queryClient]
    )
  );

  // ── Send (optimistic) ──
  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    const replyToId = replyingTo ? String(replyingTo.id) : undefined;
    setDraft("");
    setReplyingTo(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      senderId: myId,
      conversationId,
      content,
      timestamp: new Date().toISOString(),
      isRead: false,
      status: "sending",
      edited: false,
      isDeleted: false,
      reactions: [],
      replyTo: replyToId ?? null,
    };
    updateConversationCache(queryClient, conversationId, (c) => ({
      ...c,
      messages: [...c.messages, optimistic],
    }));
    // PAD-208 rule 10 — the user's OWN message always takes them to the bottom,
    // wherever they were reading. This is explicit now that the list no longer
    // follows content unconditionally.
    scrollToBottom(true);

    try {
      const saved = await messagesApi.sendMessage({
        conversationId,
        content,
        replyToId,
      });
      setRepliedLocally(true);
      updateConversationCache(queryClient, conversationId, (c) => {
        // SSE may already have delivered the saved message — drop the temp.
        const alreadyDelivered = c.messages.some(
          (m) => String(m.id) === String(saved.id)
        );
        if (alreadyDelivered) {
          return {
            ...c,
            messages: c.messages.filter((m) => m.id !== tempId),
          };
        }
        return {
          ...c,
          messages: c.messages.map((m) =>
            m.id === tempId ? { ...saved, status: "sent" as const } : m
          ),
        };
      });
      invalidateMessagesLists(queryClient);
    } catch {
      updateMessageInCache(queryClient, conversationId, tempId, (m) => ({
        ...m,
        status: "failed" as const,
      }));
    } finally {
      setSending(false);
    }
  };

  // ── Edit own message (launched from the long-press context menu) ──
  const startEditing = () => {
    if (!contextMenu) return;
    const message = contextMenu.message;
    setContextMenu(null);
    setReplyingTo(null);
    setEditing(message);
    setEditText(message.content);
  };

  const handleSaveEdit = async () => {
    if (!editing || savingEdit) return;
    const content = editText.trim();
    if (!content) return;
    setSavingEdit(true);
    try {
      await messagesApi.editMessage(String(editing.id), content);
      updateMessageInCache(queryClient, conversationId, editing.id, (m) => ({
        ...m,
        content,
        edited: true,
      }));
      setEditing(null);
      setEditText("");
    } catch {
      // Keep the edit composer open so the user can retry.
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Reactions (any message, own or other's) ──
  // Not optimistic — the message_reaction SSE event above delivers the
  // authoritative reactions array, same as web's handleToggleReaction.
  const handleToggleReaction = (messageId: string | number, emoji: string) => {
    void messagesApi.toggleReaction(String(messageId), emoji);
  };

  const handleMenuReaction = (emoji: string) => {
    if (!contextMenu) return;
    const messageId = contextMenu.message.id;
    setContextMenu(null);
    handleToggleReaction(messageId, emoji);
  };

  // ── Reply (swipe-right gesture, or the context menu since PAD-168) ──
  const handleReply = (message: Message) => {
    setEditing(null);
    setReplyingTo(message);
  };

  const startReplying = () => {
    if (!contextMenu) return;
    const message = contextMenu.message;
    setContextMenu(null);
    handleReply(message);
  };

  // ── Copy (PAD-168; web has it in MessageActionMenu, iOS had nothing) ──
  const handleCopy = () => {
    if (!contextMenu) return;
    const text = messageCopyText(contextMenu.message);
    setContextMenu(null);
    if (text === null) return;
    // expo-clipboard is a native module. Load it lazily so a binary built
    // before the module was added (an older dev client, a stale TestFlight
    // build) fails at the tap with a toast, not at route load with a red
    // screen — `requireNativeModule` throws when the module is absent, and a
    // top-level import would evaluate it while expo-router mounts this screen.
    let clipboard: typeof import("expo-clipboard");
    try {
      clipboard = require("expo-clipboard");
    } catch {
      toast.error(t("messages.somethingWentWrong"));
      return;
    }
    clipboard
      .setStringAsync(text)
      .then(() => toast.success(t("messages.messageCopied")))
      .catch(() => toast.error(t("messages.somethingWentWrong")));
  };

  // NOT an inverted list: on the New Architecture (Fabric), `inverted`
  // FlatLists (scaleY(-1) transforms) report wrong accessibility frames and
  // break hit-testing on iOS — bubbles become untappable for VoiceOver and
  // UI tests. The list keeps natural (oldest-first) order.
  //
  // PAD-208 / B-027 — how it stays anchored, and when it may move at all.
  // It used to call `scrollToEnd` from `onContentSizeChange` AND `onLayout`,
  // both unconditional, which is why the thread scrolled visibly through the
  // whole history on open and snapped back to the bottom whenever anything
  // changed while the user was reading. Three mechanisms replace that:
  //
  //   1. `atBottomRef` — updated from every scroll event. The list follows new
  //      content only while the reader was already at the bottom (rule 10).
  //      Away from the bottom, nothing moves the viewport; the "new messages"
  //      chip appears instead.
  //   2. `maintainVisibleContentPosition` — the native scroll view keeps the
  //      visible cell where it is when content is inserted above it, which is
  //      what makes a prepended older page not jump (rule 11).
  //   3. PAD-224 / B-028 — the list is HIDDEN until it is anchored. PAD-208
  //      positioned it with one `scrollToEnd` on the first content-size change
  //      while it was on screen, which still let the user watch Fabric commit
  //      rows and the viewport chase the end. `anchor-state.ts` decides when the
  //      thread is genuinely at the end — from observations, not a delay — and
  //      only then is it revealed (rule 9).
  const listRef = React.useRef<FlatList<Message>>(null);
  const atBottomRef = React.useRef(true);
  const [hasNewBelow, setHasNewBelow] = React.useState(false);
  const hasNewBelowRef = React.useRef(false);
  const [showJumpToBottom, setShowJumpToBottom] = React.useState(false);
  // Latest scroll geometry, kept in a ref: rule 12's visibility is derived from
  // it on every frame, and putting the raw numbers in state would re-render the
  // whole thread at 60fps to change one boolean.
  const scrollMetricsRef = React.useRef({ distanceFromBottom: 0, viewportHeight: 0 });

  const [anchored, setAnchored] = React.useState(false);
  const anchorRef = React.useRef(initialAnchorState());

  const dispatchAnchor = React.useCallback((event: AnchorEvent) => {
    const { state, effect } = anchorReducer(anchorRef.current, event);
    anchorRef.current = state;
    if (effect === "scrollToEnd") {
      // Deferred one frame, deliberately. Called synchronously from inside
      // `onContentSizeChange`, `scrollToEnd` reads VirtualizedList's own
      // `_scrollMetrics.contentLength`, which has not been updated with the
      // size that is being reported — so it scrolls to a stale offset, or to
      // nowhere. Instrumenting the screen showed the call being issued and the
      // list simply not moving, which is the mechanical reason PAD-208's
      // positioning never worked on a device either. The reducer stays pure;
      // only the execution of its effect waits for the frame in which the new
      // content length exists.
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
      });
    } else if (effect === "reveal") {
      setAnchored(true);
    }
    if (event.type === "reset") setAnchored(false);
  }, []);

  const setNewBelow = React.useCallback((value: boolean) => {
    hasNewBelowRef.current = value;
    setHasNewBelow(value);
  }, []);

  /** Rule 12 — recompute the control's visibility from the latest geometry. */
  const syncJumpToBottom = React.useCallback(() => {
    const { distanceFromBottom, viewportHeight } = scrollMetricsRef.current;
    setShowJumpToBottom(
      shouldShowJumpToBottom({
        distanceFromBottom,
        viewportHeight,
        hasUnseen: hasNewBelowRef.current,
      })
    );
  }, []);

  const scrollToBottom = React.useCallback(
    (animated = false) => {
      listRef.current?.scrollToEnd({ animated });
      atBottomRef.current = true;
      scrollMetricsRef.current = {
        ...scrollMetricsRef.current,
        distanceFromBottom: 0,
      };
      setNewBelow(false);
      setShowJumpToBottom(false);
    },
    [setNewBelow]
  );

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const metrics = event.nativeEvent;
      const distanceFromBottom =
        metrics.contentSize.height -
        metrics.contentOffset.y -
        metrics.layoutMeasurement.height;
      scrollMetricsRef.current = {
        distanceFromBottom,
        viewportHeight: metrics.layoutMeasurement.height,
      };

      const atBottom = isAtBottomOf(metrics);
      atBottomRef.current = atBottom;
      if (atBottom) setNewBelow(false);
      syncJumpToBottom();

      // Rule 9's second observation: a frame confirming the position took
      // effect. Ignored once anchored.
      dispatchAnchor({ type: "scroll", distanceFromBottom });
    },
    [dispatchAnchor, setNewBelow, syncJumpToBottom]
  );

  const handleContentSizeChange = React.useCallback(
    (_width: number, height: number) => {
      if (!anchored) {
        // Rule 9: while hidden, the reducer owns the positioning and decides
        // when the list has settled at the end.
        dispatchAnchor({ type: "contentSize", height });
        return;
      }
      // Rule 10: content grew and the reader was at the bottom — stay pinned.
      // Away from the bottom this is where the snap used to happen, and now it
      // deliberately does nothing.
      if (atBottomRef.current) {
        listRef.current?.scrollToEnd({ animated: false });
      }
    },
    [anchored, dispatchAnchor]
  );

  // Rule 11: reaching the top asks for the page before the oldest loaded
  // message. `useConversationThread` holds the one-page-at-a-time guard.
  const handleStartReached = React.useCallback(() => {
    // While the thread is still being anchored the list sits at offset 0, so
    // `onStartReached` fires on mount — which would fetch the page before the
    // newest one the moment the thread opens, and disturb the anchor rule 9 is
    // in the middle of establishing.
    if (!anchored) return;
    if (!hasMore || isLoadingOlder) return;
    void loadOlder();
  }, [anchored, hasMore, isLoadingOlder, loadOlder]);

  // ── Rule 9's lifecycle: reset per conversation, feed data, bound the wait ──

  // A different thread must be anchored from scratch, hidden again in between.
  React.useEffect(() => {
    dispatchAnchor({ type: "reset" });
    atBottomRef.current = true;
    hasNewBelowRef.current = false;
    scrollMetricsRef.current = { distanceFromBottom: 0, viewportHeight: 0 };
    setHasNewBelow(false);
    setShowJumpToBottom(false);
  }, [conversationId, dispatchAnchor]);

  // The first page has arrived — the list can start laying out. Later pages
  // change this count too; the reducer ignores them.
  const loadedMessageCount = conversation?.messages.length;
  React.useEffect(() => {
    if (loadedMessageCount === undefined) return;
    dispatchAnchor({ type: "data", messageCount: loadedMessageCount });
  }, [loadedMessageCount, dispatchAnchor]);

  // The bounded fallback rule 9 requires: a measurement that never settles must
  // reveal an imperfect thread rather than leave a permanently blank one.
  //
  // A plain timer, deliberately, and NOT `InteractionManager.runAfterInteractions`
  // on its own: that fires as soon as no interaction is in flight, which on a
  // freshly mounted screen is almost immediately, so it would pre-empt the
  // observations and turn the whole gate back into the timing heuristic this
  // ticket exists to remove. The observations normally win long before 300ms.
  React.useEffect(() => {
    if (anchored || loadedMessageCount === undefined) return;
    const timer = setTimeout(
      () => dispatchAnchor({ type: "fallback" }),
      ANCHOR_FALLBACK_MS
    );
    return () => clearTimeout(timer);
  }, [anchored, loadedMessageCount, conversationId, dispatchAnchor]);

  // ── Scroll to + briefly highlight a message (tapping a quoted reply) ──
  const scrollToMessage = React.useCallback(
    (messageId: string | number) => {
      if (!conversation) return;
      const index = conversation.messages.findIndex(
        (m) => String(m.id) === String(messageId)
      );
      if (index === -1) return;
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
      setHighlightedId(messageId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(
        () => setHighlightedId(null),
        900
      );
    },
    [conversation]
  );

  // ── Notification-invite respond (Yes/No on notification_invite messages) ──
  // Mirrors web's MessageBubble.tsx handleRespond. Unlike web's ephemeral
  // localResponse state, the result is written into the message's cached
  // metadata (same pattern as edit/delete/reactions above) so MessageBubble
  // renders purely off message.metadata with no local state of its own.
  const [respondingInviteId, setRespondingInviteId] = React.useState<
    string | number | null
  >(null);

  const handleRespondToInvite = async (
    message: Message,
    action: "yes" | "no"
  ) => {
    const eventId = message.metadata?.notificationEventId;
    if (!eventId || respondingInviteId !== null) return;
    setRespondingInviteId(message.id);
    try {
      const result = await notificationEngineApi.respondToNotification(
        eventId,
        action
      );
      if (result.action === "spot_filled") {
        // No toast.info in the mobile toast primitive (success/error only);
        // error is the closer fit for "this didn't work out" news.
        toast.error(t("messages.spotJustFilled"));
        updateMessageInCache(queryClient, conversationId, message.id, (m) => ({
          ...m,
          metadata: { ...m.metadata, responded: true, response: "no" },
        }));
      } else if (result.action === "confirmed") {
        updateMessageInCache(queryClient, conversationId, message.id, (m) => ({
          ...m,
          metadata: { ...m.metadata, responded: true, response: "yes" },
        }));
      } else if (result.action === "declined") {
        updateMessageInCache(queryClient, conversationId, message.id, (m) => ({
          ...m,
          metadata: { ...m.metadata, responded: true, response: "no" },
        }));
      }
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setRespondingInviteId(null);
    }
  };

  // PAD-151: attendance reminders had no response path on iOS at all. Same
  // shape as the invite handler above — the answer is written into the cached
  // message metadata so MessageBubble renders off metadata, not local state.
  const [respondingReminderId, setRespondingReminderId] = React.useState<
    string | number | null
  >(null);

  const lessonInstanceIdOf = (message: Message): number | null => {
    const raw = message.metadata?.lessonInstanceId;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  };

  const handleRespondToReminder = async (
    message: Message,
    action: "yes" | "no"
  ) => {
    const instanceId = lessonInstanceIdOf(message);
    if (!instanceId || respondingReminderId !== null) return;
    setRespondingReminderId(message.id);
    try {
      const result = await notificationEngineApi.respondToReminder(
        instanceId,
        action
      );
      // Trust the SERVER's action, not the tap: a late or superseded answer is
      // rejected backend-side, and painting the tapped choice would show a
      // state that was never recorded. PAD-68's "expired" writes nothing.
      const outcome = reminderResponseOutcome(result?.action);
      if (outcome.toastKey) toast.error(t(outcome.toastKey));
      if (outcome.write === null) return;
      const response = outcome.write;
      updateMessageInCache(queryClient, conversationId, message.id, (m) => ({
        ...m,
        metadata: {
          ...m.metadata,
          responded: true,
          response,
        },
      }));
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setRespondingReminderId(null);
    }
  };

  const handleCancelAttendance = async (message: Message) => {
    const instanceId = lessonInstanceIdOf(message);
    if (!instanceId || respondingReminderId !== null) return;
    setRespondingReminderId(message.id);
    try {
      await notificationEngineApi.cancelAttendance(instanceId);
      updateMessageInCache(queryClient, conversationId, message.id, (m) => ({
        ...m,
        metadata: { ...m.metadata, responded: true, response: "no" },
      }));
      toast.success(t("messages.attendanceCancelled"));
    } catch {
      toast.error(t("messages.cancelAttendanceFailed"));
    } finally {
      setRespondingReminderId(null);
    }
  };

  // PAD-124: the `waiting_list_offer` message had no response path on either
  // client, so the endpoint behind it was unreachable. Same shape as the
  // reminder handler above — the server's action, not the tap, decides what is
  // written into the cached metadata the bubble renders off.
  const [respondingWaitingListId, setRespondingWaitingListId] = React.useState<
    string | number | null
  >(null);

  const handleRespondToWaitingList = async (
    message: Message,
    action: "yes" | "no"
  ) => {
    const instanceId = lessonInstanceIdOf(message);
    if (!instanceId || respondingWaitingListId !== null) return;
    setRespondingWaitingListId(message.id);
    try {
      const result = await notificationEngineApi.respondToWaitingList(
        instanceId,
        action
      );
      const outcome = waitingListResponseOutcome(result?.action);
      if (outcome.toastKey) toast.error(t(outcome.toastKey));
      if (outcome.write === null) return;
      const response = outcome.write;
      updateMessageInCache(queryClient, conversationId, message.id, (m) => ({
        ...m,
        metadata: { ...m.metadata, responded: true, response },
      }));
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setRespondingWaitingListId(null);
    }
  };

  // ── Class-request proposal (classes.class-requests rule 6, PAD-281) ──
  // The bubble renders off the request's LIVE row, not the metadata frozen at
  // send time, so the list is fetched here (one row for the whole thread) and
  // refreshed by `class_request_changed` in the tabs layout. Only threads that
  // hold a proposal message pay for it.
  const hasClassRequestProposal = React.useMemo(
    () =>
      (conversation?.messages ?? []).some(
        (m) => m.metadata?.classRequest?.kind === "proposed" || m.metadata?.classRequest?.kind === "counter_proposal"
      ),
    [conversation?.messages]
  );
  const liveClassRequests = useQuery({
    queryKey: queryKeys.classRequests,
    queryFn: classRequestsApi.listClassRequests,
    enabled: hasClassRequestProposal,
  });
  const classRequestLiveFor = (message: Message) => {
    const id = message.metadata?.classRequest?.id;
    if (id == null || liveClassRequests.data === undefined) return undefined;
    return liveClassRequests.data.find((r) => r.id === id) ?? null;
  };
  const [respondingClassRequestId, setRespondingClassRequestId] = React.useState<
    string | number | null
  >(null);
  const handleAnswerClassRequest = async (message: Message, accept: boolean) => {
    const id = message.metadata?.classRequest?.id;
    if (id == null || respondingClassRequestId !== null) return;
    // `proposed` is the coach's (the student answers); `counter_proposal` is the
    // student's (the coach decides through accept / decline).
    const studentAnswers = message.metadata?.classRequest?.kind === "proposed";
    setRespondingClassRequestId(message.id);
    try {
      const slot = message.metadata?.classRequest?.slot;
      // The slot the bubble shows travels with the answer (rule 5): a stale bubble gets 409 slot_changed.
      if (studentAnswers) await classRequestsApi.answerClassRequestProposal(id, accept, slot);
      else if (accept) await classRequestsApi.acceptClassRequest(id, slot);
      else await classRequestsApi.declineClassRequest(id);
      toast.success(t(accept ? "classRequests.accepted" : studentAnswers ? "classRequests.answered" : "classRequests.declined"));
    } catch (err) {
      // A stale bubble (the request moved on) gets the server's 409 code and
      // re-reads — never an error screen.
      const refusal = classRequestsApi.classRequestRefusal(err);
      toast.error(
        refusal ? t(`classRequests.refusal.${refusal.code}`) : t("messages.somethingWentWrong")
      );
    } finally {
      setRespondingClassRequestId(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.classRequests });
    }
  };
  const handleCounterClassRequest = (message: Message) => {
    const id = message.metadata?.classRequest?.id;
    if (id == null) return;
    if (message.metadata?.classRequest?.kind === "proposed") {
      router.push({ pathname: "/(tabs)/availability", params: { proposeFor: String(id) } });
    } else {
      router.push({ pathname: "/settings", params: { section: "classRequests", proposeFor: String(id) } });
    }
  };

  // ── Delete own message (launched from the long-press context menu) ──
  const handleConfirmDelete = async () => {
    if (!confirmingDelete) return;
    const messageId = confirmingDelete.id;
    setConfirmingDelete(null);
    try {
      await messagesApi.deleteMessage(String(messageId));
      updateMessageInCache(queryClient, conversationId, messageId, (m) => ({
        ...m,
        isDeleted: true,
      }));
      invalidateMessagesLists(queryClient);
    } catch {
      // SSE delivers authoritative state on failure races.
    }
  };

  // ── Delete (launched from the long-press context menu) ──
  const startConfirmingDelete = () => {
    if (!contextMenu) return;
    setConfirmingDelete(contextMenu.message);
    setContextMenu(null);
  };

  const isTempId = (id: string | number) => String(id).startsWith("temp-");

  // The badge shows the role to the eye and to VoiceOver, so both must resolve
  // through the same key. An unknown role has no key and falls back to the raw
  // value with `capitalize` — the same behaviour as `ConversationItem` and
  // web's `getRoleLabel`.
  const roleKey = roleLabelKey(conversation?.participantRole);
  const roleLabel = roleKey ? t(roleKey) : conversation?.participantRole;

  return (
    <View className="flex-1 bg-background">
      {/* Custom header: navy chrome, our colours, and the name and role chip
          aligned on one baseline rather than centred as two boxes. */}
      <View
        style={{ paddingTop: insets.top, backgroundColor: lightTheme.sidebarBackground }}
      >
        <View className="h-14 flex-row items-center gap-2 px-2">
          <Pressable
            accessibilityLabel={t("common.back")}
            role="button"
            hitSlop={10}
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <Ionicons name="chevron-back" size={26} color={lightTheme.sidebarForeground} />
          </Pressable>

          <View className="flex-1 flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              className="shrink text-base font-bold"
              style={{ color: lightTheme.sidebarForeground }}
            >
              {participantName}
            </Text>
            {conversation?.participantRole ? (
              <View
                testID="chat-header-role"
                accessibilityLabel={t("messages.roleLabel", { role: roleLabel })}
                className="shrink-0 rounded-md px-2 py-0.5"
                style={{ backgroundColor: lightTheme.sidebarAccent }}
              >
                <Text
                  className={
                    roleKey
                      ? "text-[11px] font-semibold"
                      : "text-[11px] font-semibold capitalize"
                  }
                  style={{ color: lightTheme.sidebarPrimary }}
                >
                  {roleLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {conversation ? (
            <Pressable
              testID="chat-more-options"
              accessibilityLabel={t("messages.moreOptions")}
              role="button"
              hitSlop={10}
              onPress={() => setMoreMenuOpen(true)}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={22}
                color={lightTheme.sidebarForeground}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Stack.Screen
        options={{
          // headerShown:false — iOS 26 renders UIBarButtonItems inside a
          // translucent glass capsule, which is the grey pill behind the back
          // and options controls. A custom header keeps the navy chrome and
          // the design's colours instead of the platform's.
          // Nothing else belongs here: with the header hidden, `headerTitle`
          // and `headerRight` are never mounted. A previous fix to the role
          // badge landed on that dead `headerTitle` and shipped invisible
          // (PAD-158 / B-019) — the title, the role badge and the options
          // button all live in the custom header above.
          headerShown: false,
        }}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={keyboardAvoidingBehavior()}
        // This screen draws its own header inside the view (headerShown:false
        // above), so this frame already starts below the header and runs to the
        // bottom of the screen. React Native ADDS this offset to the avoided
        // height, so any non-zero value renders as a gap between the composer
        // and the keyboard — which is exactly what PAD-145 reported (the old
        // value, 90, dated from when the navigator header was still shown).
        keyboardVerticalOffset={0}
      >
        {/* PAD-168: mirrors web's MessagesPage banners — a student whose
            notifications are off otherwise gets no prompt to turn them back
            on. Renders nothing when permission is granted. */}
        <NotificationsBlockedBanner />

        {isLoading ? (
          <ChatSkeleton />
        ) : isError || !conversation ? (
          <ErrorState
            message={t("messages.couldNotLoadConversation")}
            onRetry={() => void refetch()}
          />
        ) : (
          <>
          {showUnknownSender ? (
            <UnknownSenderBanner
              participantName={
                conversation.participantName ?? t("messages.deletedUser")
              }
              onBlock={() => setConfirmingToggleBlock(true)}
              onReport={() => {
                setReportFromBanner(true);
                setReportMessageId(lastParticipantMessageId);
              }}
            />
          ) : null}
          <View
            className="flex-1"
            // PAD-224 rule 9 — the thread is not SHOWN until it is anchored.
            //
            // It is COVERED, not hidden: the placeholder below is opaque and
            // painted over this. An earlier version set `opacity: 0` here and
            // deadlocked — on Fabric a fully transparent subtree is not laid
            // out, so `onLayout` and `onContentSizeChange` never fired, the
            // reveal had nothing to observe, and every open fell through to the
            // fallback with the list still at offset 0. Instrumenting the
            // reducer on a simulator showed the whole trace as
            // `reset → data(30) → fallback`. The list must stay laid out to be
            // anchorable; only the user's view of it is withheld.
            //
            // `pointerEvents` still goes off while covered, so a tap that lands
            // on the placeholder cannot reach a row underneath it.
            pointerEvents={anchored ? "auto" : "none"}
            accessibilityElementsHidden={!anchored}
            importantForAccessibility={anchored ? "auto" : "no-hide-descendants"}
          >
          <FlatList
            ref={listRef}
            data={conversation.messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerClassName="gap-2 p-4"
            // PAD-224 rule 9 — the whole first page in the first batch. It is
            // 30 now rather than 50: fewer rows is a shorter unanchored
            // interval, and the rest of the history arrives by rule 11.
            initialNumToRender={CONVERSATION_FIRST_PAGE_SIZE}
            onContentSizeChange={handleContentSizeChange}
            onLayout={(event) =>
              dispatchAnchor({
                type: "layout",
                viewportHeight: event.nativeEvent.layout.height,
              })
            }
            onScroll={handleScroll}
            scrollEventThrottle={16}
            // PAD-208 rule 11 — the native scroll view holds the visible cell
            // in place when a page is inserted above it. `minIndexForVisible: 1`
            // because index 0 is `ListHeaderComponent`, the loading indicator,
            // which appears and disappears around exactly this update.
            //
            // PAD-224: only ONCE ANCHORED. While the thread is opening, holding
            // the visible cell in place is precisely wrong — it is what keeps
            // the list pinned near the top while rows commit, so `scrollToEnd`
            // never takes and the thread opens on the middle of its first page
            // (seen on a simulator recording: 200 messages, opened on 171).
            // Nothing prepends before anchoring anyway: `onStartReached` is
            // gated on `anchored` too.
            maintainVisibleContentPosition={
              anchored ? { minIndexForVisible: 1 } : undefined
            }
            onStartReached={handleStartReached}
            onStartReachedThreshold={0.2}
            ListHeaderComponent={
              isLoadingOlder ? (
                <View
                  testID="messages-loading-older"
                  accessibilityRole="progressbar"
                  className="items-center py-2"
                >
                  <Text className="text-xs text-muted-foreground">
                    {t("messages.loadingOlder")}
                  </Text>
                </View>
              ) : null
            }
            onScrollToIndexFailed={(info) => {
              // Item not measured yet (variable bubble heights) — retry
              // once layout settles, standard FlatList workaround.
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 50);
            }}
            renderItem={({ item }) => {
              const own = Number(item.senderId) === myId;
              const interactive = !item.isDeleted && !isTempId(item.id);
              const replyToMessage =
                item.replyTo != null
                  ? conversation.messages.find(
                      (m) => String(m.id) === String(item.replyTo)
                    )
                  : undefined;
              return (
                <MessageBubble
                  message={item}
                  own={own}
                  userId={myId}
                  participantName={participantName}
                  replyToMessage={replyToMessage}
                  isHighlighted={highlightedId === item.id}
                  onLongPressMenu={
                    interactive
                      ? (msg, anchor) => setContextMenu({ message: msg, anchor })
                      : undefined
                  }
                  onReply={interactive ? handleReply : undefined}
                  onScrollToReply={scrollToMessage}
                  onReaction={
                    isTempId(item.id)
                      ? undefined
                      : (emoji) => handleToggleReaction(item.id, emoji)
                  }
                  respondingReminder={respondingReminderId === item.id}
                  onRespondReminder={(action) =>
                    void handleRespondToReminder(item, action)
                  }
                  onCancelAttendance={() => void handleCancelAttendance(item)}
                  respondingWaitingList={respondingWaitingListId === item.id}
                  onRespondWaitingList={
                    isTempId(item.id)
                      ? undefined
                      : (action) => void handleRespondToWaitingList(item, action)
                  }
                  respondingInvite={respondingInviteId === item.id}
                  onRespondInvite={
                    isTempId(item.id)
                      ? undefined
                      : (action) => void handleRespondToInvite(item, action)
                  }
                  classRequestLive={classRequestLiveFor(item)}
                  respondingClassRequest={respondingClassRequestId === item.id}
                  onAnswerClassRequest={(accept) => void handleAnswerClassRequest(item, accept)}
                  onCounterClassRequest={() => handleCounterClassRequest(item)}
                />
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center py-8">
                <Text className="text-muted-foreground">
                  {t("messages.noMessagesSayHi")}
                </Text>
              </View>
            }
          />
          </View>
          </>
        )}

        {/* PAD-224 rule 9 — the neutral placeholder standing in front of the
            list while it is being anchored. The same skeleton the initial load
            shows, so opening a thread is one continuous state rather than
            skeleton → blank → thread. */}
        {conversation && !isLoading && !isError && !anchored ? (
          <View
            testID="messages-anchoring"
            className="absolute inset-0 bg-background"
            pointerEvents="none"
          >
            <ChatSkeleton />
          </View>
        ) : null}

        {/* PAD-224 rule 12 — one control, two reasons to show it. Scrolled more
            than a screen back, it is a plain jump-to-bottom chevron: the reader
            asked for a way home from a long scroll and previously had none.
            With unseen messages it is the same button carrying rule 10's "New
            messages" label, so the two never appear as competing chips.
            Mirrors web's MessageList `showScrollDown` control. */}
        {showJumpToBottom && conversation && anchored ? (
          <Pressable
            testID={hasNewBelow ? "messages-new-below" : "messages-jump-to-bottom"}
            accessibilityLabel={t(
              hasNewBelow ? "messages.newMessagesBelow" : "messages.jumpToBottom"
            )}
            role="button"
            hitSlop={8}
            onPress={() => scrollToBottom(true)}
            className={
              hasNewBelow
                ? "absolute bottom-24 self-center flex-row items-center gap-1 rounded-full px-3 py-2 active:opacity-80"
                : "absolute bottom-24 right-4 h-11 w-11 items-center justify-center rounded-full active:opacity-80"
            }
            style={{ backgroundColor: lightTheme.sidebarBackground }}
          >
            {hasNewBelow ? (
              <Text
                className="text-xs font-semibold"
                style={{ color: lightTheme.sidebarForeground }}
              >
                {t("messages.newMessagesBelow")}
              </Text>
            ) : null}
            <Ionicons
              name="chevron-down"
              size={hasNewBelow ? 14 : 22}
              color={lightTheme.sidebarForeground}
            />
          </Pressable>
        ) : null}

        {/* Composer / edit composer */}
        {editing ? (
          <View
            style={{ paddingBottom: composerPaddingBottom }}
            className="flex-row items-center gap-2 border-t border-border bg-card p-3"
          >
            <Pressable
              accessibilityLabel={t("messages.cancelEditingAria")}
              role="button"
              onPress={() => {
                setEditing(null);
                setEditText("");
              }}
              className="p-1"
            >
              <Ionicons
                name="close"
                size={22}
                color={lightTheme.mutedForeground}
              />
            </Pressable>
            <Input
              testID="message-edit-input"
              accessibilityLabel={t("messages.editMessageTextAria")}
              className="flex-1"
              value={editText}
              onChangeText={setEditText}
              multiline
            />
            <Button
              size="sm"
              testID="message-edit-save"
              accessibilityLabel={t("messages.saveEditedMessageAria")}
              disabled={!editText.trim() || savingEdit}
              onPress={() => void handleSaveEdit()}
            >
              <Text>{t("common.save")}</Text>
            </Button>
          </View>
        ) : (
          <View
            style={{ paddingBottom: composerPaddingBottom }}
            className="border-t border-border bg-card"
          >
            {/* Reply preview, mirrors web's Composer.tsx */}
            {replyingTo ? (
              <View
                testID="message-reply-preview"
                className="flex-row items-center gap-2 px-3 pt-2"
              >
                <View className="flex-1 border-r-2 border-primary pr-3">
                  <Text className="text-right text-xs font-semibold text-primary">
                    {Number(replyingTo.senderId) === myId
                      ? t("messages.you")
                      : participantName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="text-right text-xs text-muted-foreground"
                  >
                    {replyingTo.content}
                  </Text>
                </View>
                <Pressable
                  testID="message-reply-cancel"
                  accessibilityLabel={t("messages.cancelReply")}
                  role="button"
                  onPress={() => setReplyingTo(null)}
                  className="p-1"
                >
                  <Ionicons
                    name="close"
                    size={18}
                    color={lightTheme.mutedForeground}
                  />
                </Pressable>
              </View>
            ) : null}

            {isBlocked ? (
              <View testID="chat-blocked-note" className="px-3 pt-2">
                <Text className="text-xs text-muted-foreground">
                  {t("messages.blockedComposerNote")}
                </Text>
              </View>
            ) : null}

            <View className="flex-row items-end gap-2 p-3">
              <Input
                testID="message-input"
                accessibilityLabel={t("messages.messageTextAria")}
                placeholder={t("messages.typePlaceholder")}
                className="max-h-28 flex-1"
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!isBlocked}
              />
              <Pressable
                testID="message-send"
                accessibilityLabel={t("messages.sendMessageAria")}
                role="button"
                disabled={!draft.trim() || sending || !conversation || isBlocked}
                onPress={() => void handleSend()}
                className={`h-12 w-12 items-center justify-center rounded-md bg-primary active:opacity-90 ${
                  !draft.trim() || sending || isBlocked ? "opacity-50" : ""
                }`}
              >
                <Ionicons
                  name="paper-plane-outline"
                  size={20}
                  color={lightTheme.primaryForeground}
                />
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Header "more options": Block/Unblock + Report */}
      {moreMenuOpen ? (
        <ChatMoreOptionsMenu
          isBlocked={isBlocked}
          onClose={() => setMoreMenuOpen(false)}
          onToggleBlock={() => {
            setMoreMenuOpen(false);
            setConfirmingToggleBlock(true);
          }}
          onReport={() => {
            setMoreMenuOpen(false);
            setReportMessageId(lastParticipantMessageId);
          }}
        />
      ) : null}

      {/* Block / unblock confirmation */}
      <AlertDialog
        open={confirmingToggleBlock}
        onOpenChange={(open) => {
          if (!open && !togglingBlock) setConfirmingToggleBlock(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked
                ? t("messages.unblockDialogTitle")
                : t("messages.blockDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? t("messages.unblockDialogDescription")
                : t("messages.blockDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={togglingBlock}
              accessibilityLabel={t("common.cancel")}
            >
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={togglingBlock}
              accessibilityLabel={
                isBlocked ? t("messages.unblockConfirm") : t("messages.blockConfirm")
              }
              onPress={() => void handleConfirmToggleBlock()}
            >
              <Text>
                {isBlocked
                  ? t("messages.unblockConfirm")
                  : t("messages.blockConfirm")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report dialog: shared by the header's Report action and the
          long-press context menu's Report action (reportMessageId picks the target). */}
      <ReportMessageDialog
        open={reportMessageId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReportMessageId(null);
            setReportFromBanner(false);
          }
        }}
        messageId={reportMessageId}
        presetReason={reportFromBanner ? "unsolicited" : "spam"}
        onReportAndBlock={reportFromBanner ? blockFromBanner : undefined}
      />

      {/* Long-press context menu: quick reactions + Edit/Delete (own only) */}
      {contextMenu ? (
        <MessageContextMenu
          anchor={contextMenu.anchor}
          isMine={Number(contextMenu.message.senderId) === myId}
          onClose={() => setContextMenu(null)}
          onReply={startReplying}
          onCopy={
            // Hidden rather than disabled when there is nothing to copy — a
            // Copy row that silently does nothing is worse than no row.
            messageCopyText(contextMenu.message) === null
              ? undefined
              : handleCopy
          }
          onEdit={
            Number(contextMenu.message.senderId) === myId
              ? startEditing
              : undefined
          }
          onReport={() => {
            if (!contextMenu) return;
            setReportMessageId(contextMenu.message.id);
            setContextMenu(null);
          }}
          onDelete={
            Number(contextMenu.message.senderId) === myId
              ? startConfirmingDelete
              : undefined
          }
          onReaction={handleMenuReaction}
        />
      ) : null}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("messages.deleteMessageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.deleteMessageDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityLabel={t("messages.cancelDeleteAria")}>
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="message-delete-confirm"
              accessibilityLabel={t("messages.confirmDeleteMessageAria")}
              onPress={() => void handleConfirmDelete()}
            >
              <Text>{t("common.delete")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
