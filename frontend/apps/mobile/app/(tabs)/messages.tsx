import { Ionicons } from "@expo/vector-icons";
import { messagesApi } from "@levelup/api";
import {
  queryKeys,
  useCoachDisplayNameByUser,
  useCoachRoster,
  useConversations,
  useMessageableUsers,
} from "@levelup/hooks";
import type { Conversation, User } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { openConversation } from "@/features/messages/open-conversation";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { lightTheme, searchMessages } from "@levelup/config";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ConversationItem } from "@/features/messages/components/conversation-item";
import { StartConversationItem } from "@/features/messages/components/start-conversation-item";
import { normalizeId } from "@/features/messages/utils";
import { describeApiError } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { refetchAll } from "@/lib/pull-refresh";
import { PlayerSearchFeedback } from "@/features/players/player-search-feedback";

const PAGE_SIZE = 20;

/** A row of the list: a conversation, or a person a coach's search found (rule 20). */
type ListRow = Conversation | { startUser: User };

function ConversationListSkeleton() {
  return (
    <View className="gap-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          className="flex-row items-center gap-3 border-b border-border px-4 py-3"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function MessagesScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;
  // messaging.conversations rule 17 (PAD-648): "Todas" when the tab mounts; "Não lidas" is the
  // server's list, so an unread thread on any page is found.
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  // Page 1 lives in react-query (kept fresh by the SSE-driven invalidations
  // in the tabs layout); extra pages are appended imperatively below.
  const { data, isLoading, isError, refetch } = useConversations(1, PAGE_SIZE, undefined, unreadOnly);

  const [search, setSearch] = React.useState("");
  const [extra, setExtra] = React.useState<Conversation[]>([]);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const pageRef = React.useRef(1);
  // null → defer to page 1's hasMore; boolean → last imperative fetch's value.
  const [moreAvailable, setMoreAvailable] = React.useState<boolean | null>(
    null
  );
  const hasMore = moreAvailable ?? data?.hasMore ?? false;

  const conversations = React.useMemo(() => {
    const seen = new Set<string>();
    const merged: Conversation[] = [];
    for (const c of [...(data?.conversations ?? []), ...extra]) {
      const id = normalizeId(c.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(c);
    }
    return merged.sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return (
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
      );
    });
  }, [data?.conversations, extra]);

  // Mirrors web's ConversationList.tsx client-side participantName filter.
  // PAD-203: `participantName` is null for a conversation whose counterpart is
  // gone, so it falls back to the same label the row renders.
  // PAD-665 (players.search rule 8): a coach's filter uses the shared name rule; a student
  // keeps the plain substring match. Rule 20 (PAD-831): a coach's search also offers the people
  // they may message; under "Não lidas" it filters the unread rows only.
  const queryClient = useQueryClient();
  const { data: people } = useMessageableUsers({ enabled: isCoach });
  const { data: roster } = useCoachRoster({ enabled: isCoach });
  const coachNameOf = useCoachDisplayNameByUser({ enabled: isCoach });
  // Once per visit: the tab stays mounted, so a student added elsewhere shows on the next visit.
  useFocusEffect(
    React.useCallback(() => {
      if (!isCoach) return;
      void queryClient.invalidateQueries(
        { queryKey: queryKeys.messageableUsers },
        { cancelRefetch: false }
      );
    }, [isCoach, queryClient])
  );
  const rows = React.useMemo((): ListRow[] => {
    const found = searchMessages(
      conversations,
      search,
      (c) => c.participantName ?? t("messages.deletedUser"),
      { coach: isCoach, people: unreadOnly ? undefined : people, roster }
    );
    return [...found.conversations, ...found.people.map((startUser) => ({ startUser }))];
  }, [conversations, search, t, isCoach, unreadOnly, people, roster]);

  const [startingId, setStartingId] = React.useState<string | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);
  const handleStart = async (userId: string) => {
    if (startingId) return;
    setStartingId(userId);
    setStartError(null);
    try {
      const conversation = await messagesApi.createConversation({ otherParticipants: [userId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      openConversation(router, `/conversation/${conversation.id}`);
    } catch (error) {
      const info = describeApiError(error);
      if (info.network) setStartError(t("auth.login.networkError"));
      else if (info.status === 403) setStartError(t("messages.cannotMessageUser"));
      else setStartError(t("messages.somethingWentWrong"));
    } finally {
      setStartingId(null);
    }
  };

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const result = await messagesApi.getConversations(next, PAGE_SIZE, unreadOnly);
      pageRef.current = next;
      setExtra((prev) => [...prev, ...result.conversations]);
      setMoreAvailable(result.hasMore);
    } catch {
      // Keep hasMore so the user can retry by scrolling again.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, unreadOnly]);

  // PAD-786 (client.pull-to-refresh rule 1): a pull reloads page 1 and, once it has arrived,
  // drops the pages appended by scrolling, so the list starts again from the top.
  const pull = usePullToRefresh(async () => {
    await refetchAll(refetch);
    setExtra([]);
    setMoreAvailable(null);
    pageRef.current = 1;
  });

  // Switching the filter starts again from page 1 of the other list.
  const chooseFilter = (next: boolean) => {
    if (next === unreadOnly) return;
    setUnreadOnly(next);
    setExtra([]);
    setMoreAvailable(null);
    pageRef.current = 1;
  };

  const filterChip = (value: boolean, testID: string, label: string) => (
    <Pressable
      testID={testID}
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: unreadOnly === value }}
      onPress={() => chooseFilter(value)}
      hitSlop={6}
      className={cn(
        "min-h-9 justify-center rounded-full border px-4",
        unreadOnly === value ? "border-primary bg-primary" : "border-border bg-background"
      )}
    >
      <Text
        className={cn(
          "text-sm font-medium",
          unreadOnly === value ? "text-primary-foreground" : "text-foreground"
        )}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-background" testID="screen-messages">
      {/* With "Não lidas" on, the controls stay even when nothing is unread, so it can be undone. */}
      {!isLoading && !isError && (conversations.length > 0 || unreadOnly || isCoach) ? (
        <View className="gap-3 px-4 pb-3 pt-3">
          <Input
            testID="conversations-search"
            accessibilityLabel={t("messages.searchConversationAria")}
            placeholder={t("messages.searchConversationPlaceholder")}
            value={search}
            onChangeText={(value) => {
              setSearch(value);
              setStartError(null);
            }}
          />
          <View className="flex-row gap-2" accessibilityLabel={t("messages.filterAria")}>
            {filterChip(false, "conversations-filter-all", t("messages.filterAll"))}
            {filterChip(true, "conversations-filter-unread", t("messages.filterUnread"))}
          </View>
          {startError ? (
            <Text
              accessibilityRole="alert"
              testID="conversation-start-error"
              className="text-sm text-destructive"
            >
              {startError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {isLoading ? (
        <ConversationListSkeleton />
      ) : isError ? (
        <ErrorState
          message={t("messages.couldNotLoadConversations")}
          onRetry={() => void refetch()}
        />
      ) : conversations.length === 0 && unreadOnly ? (
        <EmptyState
          testID="conversations-empty-unread"
          icon="checkmark-done-outline"
          title={t("messages.noUnreadConversations")}
        />
      ) : conversations.length === 0 && !(isCoach && search.trim()) ? (
        <EmptyState
          testID="conversations-empty-none"
          icon="chatbubbles-outline"
          title={t("messages.noConversationsYet")}
          message={t("messages.startWithPlusButton")}
        />
      ) : rows.length === 0 ? (
        // players.search rule 10: a coach's search that finds nobody says so, with the query.
        isCoach && search.trim() ? (
          <View className="items-center px-6 py-8">
            <PlayerSearchFeedback query={search} count={0} className="text-center text-sm text-muted-foreground" />
          </View>
        ) : (
          <EmptyState
            icon="chatbubbles-outline"
            title={t("messages.noConversationsFound")}
          />
        )
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => ("startUser" in item ? `start-${item.startUser.id}` : String(item.id))}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            "startUser" in item ? (
              <StartConversationItem
                person={item.startUser}
                name={coachNameOf(item.startUser.id, item.startUser.name)}
                starting={startingId === String(item.startUser.id)}
                disabled={startingId !== null}
                onPress={() => void handleStart(String(item.startUser.id))}
              />
            ) : (
              <ConversationItem
                conversation={item}
                onPress={() => openConversation(router, `/conversation/${item.id}`)}
              />
            )
          }
          contentContainerStyle={{ paddingBottom: 96 }}
          refreshControl={
            <RefreshControl
              testID="messages-refresh"
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4">
                <ActivityIndicator color={lightTheme.primary} />
              </View>
            ) : null
          }
        />
      )}

      <Pressable
        testID="messages-new"
        accessibilityLabel={t("messages.newConversation")}
        role="button"
        onPress={() => router.push("/conversation/new")}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/30 active:opacity-90"
      >
        <Ionicons name="add" size={28} color={lightTheme.primaryForeground} />
      </Pressable>
    </View>
  );
}
