import { messagesApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { useConversations } from "@levelup/hooks";
import type { User } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useMessageableUsers } from "@/features/messages/hooks";
import { initialsOf, normalizeId } from "@/features/messages/utils";

const HEADER_OPTIONS = {
  headerShown: true,
  headerBackButtonDisplayMode: "minimal" as const,
  headerStyle: { backgroundColor: lightTheme.sidebarBackground },
  headerTintColor: lightTheme.sidebarForeground,
  headerTitleStyle: { fontWeight: "700" as const },
};

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

  const candidates = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => String(u.id) !== String(me?.id))
      .filter((u) => !term || u.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, me?.id, search]);

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
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/conversation/${conversation.id}`);
    } catch {
      setCreatingId(null);
    }
  };

  return (
    <View className="flex-1 bg-background" testID="screen-new-conversation">
      <Stack.Screen
        options={{ ...HEADER_OPTIONS, title: t("messages.newConversation") }}
      />

      <View className="border-b border-border p-3">
        <Input
          accessibilityLabel={t("messages.searchPeopleAria")}
          placeholder={t("messages.searchPeoplePlaceholder")}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {isLoading ? (
        <View className="gap-0">
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              className="flex-row items-center gap-3 border-b border-border px-4 py-3"
            >
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </View>
          ))}
        </View>
      ) : isError ? (
        <ErrorState
          message={t("messages.couldNotLoadPeople")}
          onRetry={() => void refetch()}
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={t("messages.noPeopleFound")}
          message={search ? t("messages.tryDifferentSearch") : undefined}
        />
      ) : (
        <FlatList
          data={candidates}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Pressable
              testID={`user-item-${item.id}`}
              accessibilityLabel={t("messages.startConversationWithAria", {
                name: item.name,
              })}
              role="button"
              disabled={!!creatingId}
              onPress={() => void handlePick(item)}
              className="flex-row items-center gap-3 border-b border-border bg-card px-4 py-3 active:bg-accent"
            >
              <Avatar alt={item.name}>
                {item.avatarUrl ? (
                  <AvatarImage source={{ uri: item.avatarUrl }} />
                ) : null}
                <AvatarFallback>
                  <Text>{item.abbreviation || initialsOf(item.name)}</Text>
                </AvatarFallback>
              </Avatar>
              <Text className="flex-1 text-base text-foreground">
                {item.name}
              </Text>
              {creatingId === String(item.id) ? (
                <ActivityIndicator color={lightTheme.primary} />
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
