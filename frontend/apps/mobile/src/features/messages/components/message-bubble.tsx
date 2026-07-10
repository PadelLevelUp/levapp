import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { Message, MessageStatus } from "@levelup/types";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "../utils";

// Mirrors web's hardcoded read-receipt blue (Tailwind's blue-300) — a
// one-off accent, not part of the @levelup/config design tokens.
const READ_ICON_COLOR = "#93c5fd";

/** Appends a CSS Color 4 alpha to a `hsl(h s% l%)` token string. */
function withAlpha(hsl: string, alpha: number): string {
  return hsl.replace(")", ` / ${alpha})`);
}

/** Mirrors apps/web/src/components/messages/MessageBubble.tsx's StatusIcon. */
function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case "sending":
      return (
        <Ionicons
          name="time-outline"
          size={12}
          color={withAlpha(lightTheme.primaryForeground, 0.5)}
        />
      );
    case "sent":
      return (
        <Ionicons
          name="checkmark"
          size={12}
          color={withAlpha(lightTheme.primaryForeground, 0.6)}
        />
      );
    case "delivered":
      return (
        <Ionicons
          name="checkmark-done"
          size={12}
          color={withAlpha(lightTheme.primaryForeground, 0.6)}
        />
      );
    case "read":
      return (
        <Ionicons name="checkmark-done" size={12} color={READ_ICON_COLOR} />
      );
    case "failed":
      return (
        <Ionicons
          name="alert-circle"
          size={12}
          color={lightTheme.destructive}
        />
      );
    default:
      return null;
  }
}

type MessageBubbleProps = {
  message: Message;
  /** True when the current user sent this message. */
  own: boolean;
  /** True when this bubble is the current selection target (own messages
   * get edit/delete in the action bar; any message gets quick reactions). */
  selected?: boolean;
  /** Fires for any non-deleted message (opens the selection action bar). */
  onSelect?: () => void;
  /** Current user id, to highlight reaction pills the user has toggled on. */
  userId?: number;
  /** Toggles the given emoji reaction on this message. */
  onReaction?: (emoji: string) => void;
};

/** Chat bubble: own messages right/brand-colored, others left/muted. */
export function MessageBubble({
  message,
  own,
  selected,
  onSelect,
  userId,
  onReaction,
}: MessageBubbleProps) {
  // Selecting a message is allowed for both own and other messages — own
  // messages get edit/delete in the action bar, any message gets reactions.
  const selectable = !message.isDeleted && !!onSelect;

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
          </Text>
          {own && message.status ? (
            <StatusIcon status={message.status} />
          ) : null}
        </View>
      </View>

      {message.reactions && message.reactions.length > 0 ? (
        <View
          className={cn(
            "mt-1 flex-row flex-wrap gap-1",
            own ? "self-end" : "self-start"
          )}
        >
          {Array.from(new Set(message.reactions.map((r) => r.emoji))).map(
            (emoji, index) => {
              const count = message.reactions!.filter(
                (r) => r.emoji === emoji
              ).length;
              const mine = message.reactions!.some(
                (r) => r.emoji === emoji && Number(r.userId) === userId
              );
              return (
                <Pressable
                  key={emoji}
                  testID={`message-reaction-${message.id}-${index}`}
                  accessibilityLabel={`${emoji} reaction${
                    count > 1 ? ` (${count})` : ""
                  }`}
                  role="button"
                  disabled={!onReaction}
                  onPress={() => onReaction?.(emoji)}
                  className={cn(
                    "flex-row items-center gap-0.5 rounded-full border px-1.5 py-0.5",
                    mine
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  )}
                >
                  <Text className="text-xs">{emoji}</Text>
                  {count > 1 ? (
                    <Text className="text-xs text-muted-foreground">
                      {count}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }
          )}
        </View>
      ) : null}
    </Pressable>
  );
}
