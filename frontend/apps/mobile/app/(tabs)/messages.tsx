import { Ionicons } from "@expo/vector-icons";
import { messagesApi } from "@levelup/api";
import { useConversations } from "@levelup/hooks";
import type { Conversation } from "@levelup/types";
import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { lightTheme } from "@levelup/config";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationItem } from "@/features/messages/components/conversation-item";
import { normalizeId } from "@/features/messages/utils";

const PAGE_SIZE = 20;

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
  // Page 1 lives in react-query (kept fresh by the SSE-driven invalidations
  // in the tabs layout); extra pages are appended imperatively below.
  const { data, isLoading, isError, refetch } = useConversations(1, PAGE_SIZE);

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

  const loadMore = React.useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      const result = await messagesApi.getConversations(next, PAGE_SIZE);
      pageRef.current = next;
      setExtra((prev) => [...prev, ...result.conversations]);
      setMoreAvailable(result.hasMore);
    } catch {
      // Keep hasMore so the user can retry by scrolling again.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore]);

  return (
    <View className="flex-1 bg-background" testID="screen-messages">
      {isLoading ? (
        <ConversationListSkeleton />
      ) : isError ? (
        <ErrorState
          message="Could not load conversations."
          onRetry={() => void refetch()}
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          message="Start a conversation with the + button."
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ConversationItem
              conversation={item}
              onPress={() => router.push(`/conversation/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 96 }}
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
        accessibilityLabel="New conversation"
        role="button"
        onPress={() => router.push("/conversation/new")}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/30 active:opacity-90"
      >
        <Ionicons name="add" size={28} color={lightTheme.primaryForeground} />
      </Pressable>
    </View>
  );
}
