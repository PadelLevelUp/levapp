import type { Message } from "@levelup/types";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "../utils";

type MessageBubbleProps = {
  message: Message;
  /** True when the current user sent this message. */
  own: boolean;
  /** True when this bubble is the current edit/delete selection target. */
  selected?: boolean;
  /** Fires for own, non-deleted messages (opens the edit/delete actions). */
  onSelect?: () => void;
};

/** Chat bubble: own messages right/brand-colored, others left/muted. */
export function MessageBubble({
  message,
  own,
  selected,
  onSelect,
}: MessageBubbleProps) {
  const selectable = own && !message.isDeleted && !!onSelect;

  return (
    <Pressable
      testID={`message-item-${message.id}`}
      accessibilityLabel={
        message.isDeleted ? "Deleted message" : message.content
      }
      disabled={!selectable}
      onPress={onSelect}
      onLongPress={onSelect}
      className={cn(
        "max-w-[80%]",
        own ? "self-end" : "self-start",
        selected && "opacity-70"
      )}
    >
      <View
        className={cn(
          "rounded-2xl px-3 py-2",
          own ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-muted",
          selected && "border border-ring"
        )}
      >
        {message.isDeleted ? (
          <Text
            className={cn(
              "text-base italic",
              own
                ? "text-primary-foreground opacity-70"
                : "text-muted-foreground"
            )}
          >
            Message deleted
          </Text>
        ) : (
          <Text
            className={cn(
              "text-base",
              own ? "text-primary-foreground" : "text-foreground"
            )}
          >
            {message.content}
          </Text>
        )}

        <View className="mt-0.5 flex-row items-center gap-1 self-end">
          <Text
            className={cn(
              "text-[11px]",
              own
                ? "text-primary-foreground opacity-70"
                : "text-muted-foreground"
            )}
          >
            {formatMessageTime(message.timestamp)}
            {message.edited ? " · edited" : ""}
            {message.status === "sending" ? " · sending…" : ""}
            {message.status === "failed" ? " · failed" : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
