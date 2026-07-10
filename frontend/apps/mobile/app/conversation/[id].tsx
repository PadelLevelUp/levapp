import { Ionicons } from "@expo/vector-icons";
import { messagesApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { queryKeys, useConversation } from "@levelup/hooks";
import type { Message } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import * as React from "react";
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
import { MessageBubble } from "@/features/messages/components/message-bubble";
import {
  invalidateMessagesLists,
  normalizeId,
  updateConversationCache,
  updateMessageInCache,
} from "@/features/messages/utils";
import { useAppEvents } from "@/lib/sse";

// Mirrors web's MessageActionMenu.tsx quickReactions.
const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

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
  const [selected, setSelected] = React.useState<Message | null>(null);
  const [editing, setEditing] = React.useState<Message | null>(null);
  const [editText, setEditText] = React.useState("");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);

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
    setDraft("");
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
    };
    updateConversationCache(queryClient, conversationId, (c) => ({
      ...c,
      messages: [...c.messages, optimistic],
    }));

    try {
      const saved = await messagesApi.sendMessage({ conversationId, content });
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

  // ── Edit own message ──
  const startEditing = () => {
    if (!selected) return;
    setEditing(selected);
    setEditText(selected.content);
    setSelected(null);
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

  const handleQuickReaction = (emoji: string) => {
    if (!selected) return;
    const messageId = selected.id;
    setSelected(null);
    handleToggleReaction(messageId, emoji);
  };

  // ── Delete own message ──
  const handleConfirmDelete = async () => {
    if (!selected) return;
    const messageId = selected.id;
    setConfirmingDelete(false);
    setSelected(null);
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

  // NOT an inverted list: on the New Architecture (Fabric), `inverted`
  // FlatLists (scaleY(-1) transforms) report wrong accessibility frames and
  // break hit-testing on iOS — bubbles become untappable for VoiceOver and
  // UI tests. Instead the list keeps natural (oldest-first) order and stays
  // anchored to the bottom via scrollToEnd on content-size changes.
  const listRef = React.useRef<FlatList<Message>>(null);
  const scrollToBottom = React.useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

  const isTempId = (id: string | number) => String(id).startsWith("temp-");

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerShown: true,
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
            renderItem={({ item }) => {
              const own = Number(item.senderId) === myId;
              return (
                <MessageBubble
                  message={item}
                  own={own}
                  selected={selected?.id === item.id}
                  userId={myId}
                  // Selectable regardless of ownership — own messages get
                  // edit/delete in the action bar, any message gets reactions.
                  onSelect={
                    !item.isDeleted && !isTempId(item.id)
                      ? () =>
                          setSelected((prev) =>
                            prev?.id === item.id ? null : item
                          )
                      : undefined
                  }
                  onReaction={
                    isTempId(item.id)
                      ? undefined
                      : (emoji) => handleToggleReaction(item.id, emoji)
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

        {/* Action bar for the selected message: quick reactions for any
            message, edit/delete restricted to own messages. */}
        {selected && !editing ? (
          <View className="border-t border-border bg-card">
            <View className="flex-row items-center justify-around border-b border-border px-2 py-2">
              {QUICK_REACTIONS.map((emoji, index) => (
                <Pressable
                  key={emoji}
                  testID={`reaction-${index}`}
                  accessibilityLabel={`React with ${emoji}`}
                  role="button"
                  onPress={() => handleQuickReaction(emoji)}
                  className="p-1 active:opacity-60"
                >
                  <Text className="text-2xl">{emoji}</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row items-center gap-2 px-4 py-2">
              <Text
                numberOfLines={1}
                className="flex-1 text-sm text-muted-foreground"
              >
                {selected.content}
              </Text>
              {Number(selected.senderId) === myId ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    testID="message-edit"
                    accessibilityLabel="Edit message"
                    onPress={startEditing}
                  >
                    <Text>Edit</Text>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    testID="message-delete"
                    accessibilityLabel="Delete message"
                    onPress={() => setConfirmingDelete(true)}
                  >
                    <Text>Delete</Text>
                  </Button>
                </>
              ) : null}
              <Pressable
                accessibilityLabel="Dismiss message actions"
                role="button"
                onPress={() => setSelected(null)}
                className="p-1"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={lightTheme.mutedForeground}
                />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Composer / edit composer */}
        {editing ? (
          <View className="flex-row items-center gap-2 border-t border-border bg-card p-3">
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
          <View className="flex-row items-end gap-2 border-t border-border bg-card p-3">
            <Input
              testID="message-input"
              accessibilityLabel="Message text"
              placeholder="Type a message…"
              className="max-h-28 flex-1"
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable
              testID="message-send"
              accessibilityLabel="Send message"
              role="button"
              disabled={!draft.trim() || sending || !conversation}
              onPress={() => void handleSend()}
              className={`h-12 w-12 items-center justify-center rounded-full bg-primary active:opacity-90 ${
                !draft.trim() || sending ? "opacity-50" : ""
              }`}
            >
              <Ionicons
                name="send"
                size={20}
                color={lightTheme.primaryForeground}
              />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Delete confirmation */}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
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
