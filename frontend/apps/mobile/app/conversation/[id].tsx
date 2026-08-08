import { Ionicons } from "@expo/vector-icons";
import { messagesApi, notificationEngineApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { queryKeys, useConversation } from "@levelup/hooks";
import type { Message } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
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
import { Badge } from "@/components/ui/badge";
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
import {
  invalidateMessagesLists,
  normalizeId,
  updateConversationCache,
  updateMessageInCache,
} from "@/features/messages/utils";
import { useAppEvents } from "@/lib/sse";

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
  // Pushed route (no tab bar): the composer must clear the home indicator.
  const insets = useSafeAreaInsets();
  const composerPaddingBottom = Math.max(insets.bottom, 12);
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
  } = useConversation(conversationId);

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
          updateConversationCache(queryClient, conversationId, (c) => {
            const exists = c.messages.some(
              (m) => String(m.id) === String(message.id)
            );
            if (exists) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  String(m.id) === String(message.id)
                    ? { ...m, status: "delivered" as const }
                    : m
                ),
              };
            }
            return {
              ...c,
              messages: [
                ...c.messages,
                { ...message, status: "delivered" as const },
              ],
            };
          });
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

    try {
      const saved = await messagesApi.sendMessage({
        conversationId,
        content,
        replyToId,
      });
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

  // ── Reply (launched from the swipe-right gesture on a bubble) ──
  const handleReply = (message: Message) => {
    setEditing(null);
    setReplyingTo(message);
  };

  // NOT an inverted list: on the New Architecture (Fabric), `inverted`
  // FlatLists (scaleY(-1) transforms) report wrong accessibility frames and
  // break hit-testing on iOS — bubbles become untappable for VoiceOver and
  // UI tests. Instead the list keeps natural (oldest-first) order and stays
  // anchored to the bottom via scrollToEnd on content-size changes.
  const listRef = React.useRef<FlatList<Message>>(null);
  const scrollToBottom = React.useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

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

  return (
    <View className="flex-1 bg-background">
      {/* Custom header: navy chrome, our colours, and the name and role chip
          aligned on one baseline rather than centred as two boxes. */}
      <View
        style={{ paddingTop: insets.top, backgroundColor: lightTheme.sidebarBackground }}
      >
        <View className="h-14 flex-row items-center gap-2 px-2">
          <Pressable
            accessibilityLabel="Back"
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
              {conversation?.participantName ?? "Conversation"}
            </Text>
            {conversation?.participantRole ? (
              <View
                testID="chat-header-role"
                className="shrink-0 rounded-md px-2 py-0.5"
                style={{ backgroundColor: lightTheme.sidebarAccent }}
              >
                <Text
                  className="text-[11px] font-semibold capitalize"
                  style={{ color: lightTheme.sidebarPrimary }}
                >
                  {conversation.participantRole}
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
          headerShown: false,
          headerBackButtonDisplayMode: "minimal",
          headerStyle: { backgroundColor: lightTheme.sidebarBackground },
          headerTintColor: lightTheme.sidebarForeground,
          headerTitle: () => (
            <View className="flex-row items-center gap-2">
              <Text
                numberOfLines={1}
                className="text-base font-bold"
                style={{ color: lightTheme.sidebarForeground }}
              >
                {conversation?.participantName ?? "Conversation"}
              </Text>
              {conversation?.participantRole ? (
                <Badge
                  variant="secondary"
                  testID="chat-header-role"
                  accessibilityLabel={`Role: ${conversation.participantRole}`}
                >
                  <Text className="capitalize">
                    {conversation.participantRole}
                  </Text>
                </Badge>
              ) : null}
            </View>
          ),
          headerRight: conversation
            ? () => (
                <Pressable
                  testID="chat-more-options"
                  accessibilityLabel={t("messages.moreOptions")}
                  role="button"
                  hitSlop={8}
                  onPress={() => setMoreMenuOpen(true)}
                  className="p-1.5 active:opacity-60"
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={22}
                    color={lightTheme.sidebarForeground}
                  />
                </Pressable>
              )
            : undefined,
        }}
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {isLoading ? (
          <ChatSkeleton />
        ) : isError || !conversation ? (
          <ErrorState
            message="Could not load this conversation."
            onRetry={() => void refetch()}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={conversation.messages}
            keyExtractor={(item) => String(item.id)}
            contentContainerClassName="gap-2 p-4"
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
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
                  participantName={conversation.participantName}
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
                  respondingInvite={respondingInviteId === item.id}
                  onRespondInvite={
                    isTempId(item.id)
                      ? undefined
                      : (action) => void handleRespondToInvite(item, action)
                  }
                />
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center py-8">
                <Text className="text-muted-foreground">
                  No messages yet. Say hi!
                </Text>
              </View>
            }
          />
        )}

        {/* Composer / edit composer */}
        {editing ? (
          <View
            style={{ paddingBottom: composerPaddingBottom }}
            className="flex-row items-center gap-2 border-t border-border bg-card px-3 pt-3"
          >
            <Pressable
              accessibilityLabel="Cancel editing"
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
              accessibilityLabel="Edit message text"
              className="flex-1"
              value={editText}
              onChangeText={setEditText}
              multiline
            />
            <Button
              size="sm"
              testID="message-edit-save"
              accessibilityLabel="Save edited message"
              disabled={!editText.trim() || savingEdit}
              onPress={() => void handleSaveEdit()}
            >
              <Text>Save</Text>
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
                      : conversation?.participantName}
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
                accessibilityLabel="Message text"
                placeholder="Type a message…"
                className="max-h-28 flex-1"
                value={draft}
                onChangeText={setDraft}
                multiline
                editable={!isBlocked}
              />
              <Pressable
                testID="message-send"
                accessibilityLabel="Send message"
                role="button"
                disabled={!draft.trim() || sending || !conversation || isBlocked}
                onPress={() => void handleSend()}
                className={`h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-90 ${
                  !draft.trim() || sending || isBlocked ? "opacity-50" : ""
                }`}
              >
                <Ionicons
                  name="send"
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
              accessibilityLabel="Cancel"
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
          if (!open) setReportMessageId(null);
        }}
        messageId={reportMessageId}
      />

      {/* Long-press context menu: quick reactions + Edit/Delete (own only) */}
      {contextMenu ? (
        <MessageContextMenu
          anchor={contextMenu.anchor}
          isMine={Number(contextMenu.message.senderId) === myId}
          onClose={() => setContextMenu(null)}
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
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              The message will be replaced by a “deleted” placeholder for both
              participants.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityLabel="Cancel delete">
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="message-delete-confirm"
              accessibilityLabel="Confirm delete message"
              onPress={() => void handleConfirmDelete()}
            >
              <Text>Delete</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
