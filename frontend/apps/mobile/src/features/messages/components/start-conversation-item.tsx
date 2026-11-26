import type { User } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";
import { lightTheme } from "@levelup/config";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { initialsOf } from "../utils";

type StartConversationItemProps = {
  person: User;
  /** The coach's display name for them. */
  name: string;
  starting: boolean;
  disabled: boolean;
  onPress: () => void;
};

/**
 * messaging.conversations rule 20 (PAD-831): a person the coach's search found who has no loaded
 * conversation row. Twin of the start rows in web's ConversationList.
 */
export function StartConversationItem({ person, name, starting, disabled, onPress }: StartConversationItemProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={`conversation-start-${person.id}`}
      accessibilityLabel={t("messages.startConversationWithAria", { name })}
      role="button"
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border bg-card px-4 py-3 active:bg-accent"
    >
      <Avatar alt={name}>
        {person.avatarUrl ? <AvatarImage source={{ uri: person.avatarUrl }} /> : null}
        <AvatarFallback>
          <Text>{initialsOf(name)}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-base font-normal text-foreground">
          {name}
        </Text>
        <Text numberOfLines={1} className="text-sm text-muted-foreground">
          {t("messages.startConversationRow")}
        </Text>
      </View>
      {starting ? <ActivityIndicator color={lightTheme.primary} /> : null}
    </Pressable>
  );
}
