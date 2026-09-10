import { messagesApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { useConversations } from "@levelup/hooks";
import type { User } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { ErrorState } from "@/components/error-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useMessageableUsers } from "@/features/messages/hooks";
import { initialsOf, normalizeId } from "@/features/messages/utils";
import { describeApiError } from "@/lib/apiError";

const HEADER_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: "minimal" as const,
  headerStyle: { backgroundColor: lightTheme.sidebarBackground },
  headerTintColor: lightTheme.sidebarForeground,
  headerTitleStyle: { fontWeight: "700" as const },
};

/**
 * New conversation — mirrors the web `NewConversationDialog` (messaging.
 * direct-by-username rules 6–8):
 *
 *   1. a search field over the people you are already CONNECTED with (a coach's
 *      roster and club players, a student's coaches) — this is the only kind of
 *      search there is: nobody beyond your connections is discoverable;
 *   2. that list, one tap starts (or reopens) the conversation;
 *   3. below it, "Message by username": anyone — coach or student — can reach
 *      any other user by their exact username. Shown for every role.
 */
export default function NewConversationScreen() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data: users, isLoading, isError, refetch } = useMessageableUsers();
  // First page is enough to reuse an already-open conversation; the backend
  // create endpoint handles the rest.
  const { data: conversationsPage } = useConversations(1, 100);

  const [search, setSearch] = React.useState("");
  const [creatingId, setCreatingId] = React.useState<string | null>(null);

  const [username, setUsername] = React.useState("");
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [submittingUsername, setSubmittingUsername] = React.useState(false);

  const openConversation = (id: string | number) => {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    router.replace(`/conversation/${id}`);
  };

  const handleStartByUsername = async () => {
    const value = username.trim();
    if (!value || submittingUsername) return;
    setSubmittingUsername(true);
    setUsernameError(null);
    try {
      const conversation = await messagesApi.createConversation({ otherUsername: value });
      openConversation(conversation.id);
    } catch (error) {
      const info = describeApiError(error);
      if (info.network) setUsernameError(t("auth.login.networkError"));
      else if (info.status === 404) setUsernameError(t("messages.noUserWithUsername"));
      else if (info.status === 403) setUsernameError(t("messages.cannotMessageUser"));
      else setUsernameError(info.message ?? t("messages.somethingWentWrong"));
    } finally {
      setSubmittingUsername(false);
    }
  };

  const connected = React.useMemo(
    () =>
      (users ?? [])
        .filter((u) => String(u.id) !== String(me?.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users, me?.id]
  );
  const term = search.trim().toLowerCase();
  const candidates = React.useMemo(
    () => (term ? connected.filter((u) => u.name.toLowerCase().includes(term)) : connected),
    [connected, term]
  );

  const handlePick = async (picked: User) => {
    if (creatingId) return;
    const existing = conversationsPage?.conversations.find(
      (c) => normalizeId(c.participantId) === normalizeId(picked.id)
    );
    if (existing) {
      router.replace(`/conversation/${existing.id}`);
      return;
    }
    setCreatingId(String(picked.id));
    try {
      const conversation = await messagesApi.createConversation({
        otherParticipants: [String(picked.id)],
      });
      openConversation(conversation.id);
    } catch {
      setCreatingId(null);
    }
  };

  const listHeader = (
    <View className="border-b border-border bg-background px-4 pb-2 pt-3" testID="new-conversation-header">
      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("messages.connectedPeople")}
      </Text>
      <Input
        testID="new-conversation-search"
        accessibilityLabel={t("messages.searchConnectedAria")}
        placeholder={t("messages.searchConnectedPlaceholder")}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
    </View>
  );

  const listEmpty = isLoading ? (
    <View>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </View>
      ))}
    </View>
  ) : isError ? (
    <ErrorState message={t("messages.couldNotLoadPeople")} onRetry={() => void refetch()} />
  ) : (
    <View className="items-center gap-1 px-6 py-8" testID="new-conversation-empty">
      <Text className="text-base font-medium text-foreground">
        {term ? t("messages.noOneMatches") : t("messages.notConnectedYet")}
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        {term ? t("messages.tryDifferentSearch") : t("messages.notConnectedYetHint")}
      </Text>
    </View>
  );

  const listFooter = (
    <View className="mt-2 border-t border-border bg-background px-4 pb-6 pt-4" testID="message-by-username">
      <Text className="text-sm font-medium text-foreground">{t("messages.messageByUsername")}</Text>
      <Text className="mb-2 text-xs text-muted-foreground">{t("messages.messageByUsernameExplain")}</Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input
            testID="message-by-username-input"
            accessibilityLabel={t("messages.messageByUsername")}
            placeholder={t("messages.usernamePlaceholder")}
            value={username}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onChangeText={(v) => {
              setUsername(v);
              if (usernameError) setUsernameError(null);
            }}
            onSubmitEditing={() => void handleStartByUsername()}
          />
        </View>
        <Button
          testID="message-by-username-submit"
          disabled={!username.trim() || submittingUsername}
          onPress={() => void handleStartByUsername()}
        >
          {submittingUsername ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text>{t("messages.usernameSubmit")}</Text>
          )}
        </Button>
      </View>
      {usernameError ? (
        <Text className="mt-2 text-sm text-destructive" testID="message-by-username-error">
          {usernameError}
        </Text>
      ) : null}
      <Text className="mt-2 text-xs text-muted-foreground">{t("messages.messageByUsernameHint")}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="screen-new-conversation"
    >
      <Stack.Screen options={{ ...HEADER_OPTIONS, title: t("messages.newConversation") }} />
      <FlatList
        data={isLoading || isError ? [] : candidates}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={listFooter}
        contentContainerClassName="pb-4"
        renderItem={({ item }) => (
          <Pressable
            testID={`user-item-${item.id}`}
            accessibilityLabel={t("messages.startConversationWithAria", { name: item.name })}
            role="button"
            disabled={!!creatingId}
            onPress={() => void handlePick(item)}
            className="flex-row items-center gap-3 border-b border-border bg-card px-4 py-3 active:bg-accent"
          >
            <Avatar alt={item.name}>
              {item.avatarUrl ? <AvatarImage source={{ uri: item.avatarUrl }} /> : null}
              <AvatarFallback>
                <Text>{item.abbreviation || initialsOf(item.name)}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex-1">
              <Text className="text-base text-foreground">{item.name}</Text>
              {/* PAD-227: the picker carries the public shape — the username, never the email. */}
              {item.username ? (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  @{item.username}
                </Text>
              ) : null}
            </View>
            {creatingId === String(item.id) ? <ActivityIndicator color={lightTheme.primary} /> : null}
          </Pressable>
        )}
      />
    </KeyboardAvoidingView>
  );
}
