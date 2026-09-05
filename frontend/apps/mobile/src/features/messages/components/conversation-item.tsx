import type { Conversation } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { formatConversationTime, initialsOf } from "../utils";

type ConversationItemProps = {
  conversation: Conversation;
  onPress: () => void;
};

/** Single row of the conversation list (name, role, preview, unread badge). */
export function ConversationItem({
  conversation,
  onPress,
}: ConversationItemProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const {
    participantName,
    participantAvatar,
    participantRole,
    lastMessage,
    lastMessageAt,
    unreadCount,
  } = conversation;

  return (
    <Pressable
      testID={`conversation-item-${conversation.id}`}
      accessibilityLabel={t("messages.conversationWithAria", {
        name: participantName,
      })}
      role="button"
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border bg-card px-4 py-3 active:bg-accent"
    >
      <Avatar alt={participantName}>
        {participantAvatar ? (
          <AvatarImage source={{ uri: participantAvatar }} />
        ) : null}
        <AvatarFallback>
          <Text>{initialsOf(participantName)}</Text>
        </AvatarFallback>
      </Avatar>

      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className="flex-1 text-base font-semibold text-foreground"
          >
            {participantName}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {formatConversationTime(lastMessageAt, {
              locale,
              yesterdayLabel: t("messages.yesterday"),
            })}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {participantRole ? (
            <Badge variant="outline">
              <Text className="capitalize">{participantRole}</Text>
            </Badge>
          ) : null}
          <Text
            numberOfLines={1}
            className="flex-1 text-sm text-muted-foreground"
          >
            {lastMessage ?? t("messages.noMessagesYet")}
          </Text>
          {unreadCount > 0 ? (
            <Badge testID={`conversation-unread-${conversation.id}`}>
              <Text>{unreadCount}</Text>
            </Badge>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
