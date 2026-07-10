import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { Message, MessageStatus } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "../utils";

// Mirrors web's hardcoded read-receipt blue (Tailwind's blue-300) — a
// one-off accent, not part of the @levelup/config design tokens.
const READ_ICON_COLOR = "#93c5fd";
// Mirrors web's Tailwind emerald-600 accent for the invite "accepted" badge
// icon (Ionicons needs a color string, not a class) — same one-off pattern.
const ACCEPTED_ICON_COLOR = "#059669";

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
  /** True while a respond-to-invite request for this message is in flight. */
  respondingInvite?: boolean;
  /** Fires when the user taps Yes/No on a notification_invite message. */
  onRespondInvite?: (action: "yes" | "no") => void;
};

/** Chat bubble: own messages right/brand-colored, others left/muted. */
export function MessageBubble({
  message,
  own,
  selected,
  onSelect,
  userId,
  onReaction,
  respondingInvite,
  onRespondInvite,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  // Selecting a message is allowed for both own and other messages — own
  // messages get edit/delete in the action bar, any message gets reactions.
  const selectable = !message.isDeleted && !!onSelect;

  // Notification-invite response area, mirrors web's MessageBubble.tsx
  // messageType === "notification_invite" block: own messages show a
  // "waiting" status line while unanswered, received invites get Yes/No.
  // Unlike web (which tracks an ephemeral localResponse state), the response
  // is written straight into message.metadata by the caller (see
  // conversation/[id].tsx's handleRespondToInvite + updateMessageInCache),
  // so this component just renders off message.metadata like any other
  // steady-state field.
  const isInvite = message.messageType === "notification_invite";
  const alreadyResponded = !!message.metadata?.responded;
  const response = message.metadata?.response;

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

      {isInvite ? (
        <View
          className={cn(
            "mt-1.5 flex-row gap-2",
            own ? "self-end" : "self-start"
          )}
        >
          {alreadyResponded ? (
            response === "yes" ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5">
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={ACCEPTED_ICON_COLOR}
                />
                <Text className="text-xs font-medium text-emerald-600">
                  {t("messages.accepted")}
                </Text>
              </View>
            ) : response === "no" ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5">
                <Ionicons
                  name="close"
                  size={14}
                  color={lightTheme.destructive}
                />
                <Text className="text-xs font-medium text-destructive">
                  {t("messages.declined")}
                </Text>
              </View>
            ) : (
              <View className="rounded-full bg-amber-500/15 px-3 py-1.5">
                <Text className="text-xs font-medium text-amber-600">
                  {t("messages.spotFilled")}
                </Text>
              </View>
            )
          ) : own ? (
            <Text className="text-xs italic text-muted-foreground">
              {t("messages.waitingForResponse")}
            </Text>
          ) : (
            <>
              <Pressable
                testID="message-respond-yes"
                accessibilityLabel={t("messages.yes")}
                role="button"
                disabled={respondingInvite}
                onPress={() => onRespondInvite?.("yes")}
                className={cn(
                  "flex-1 items-center rounded-xl bg-primary py-1.5",
                  respondingInvite && "opacity-50"
                )}
              >
                <Text className="text-sm font-medium text-primary-foreground">
                  {t("messages.yes")}
                </Text>
              </Pressable>
              <Pressable
                testID="message-respond-no"
                accessibilityLabel={t("messages.no")}
                role="button"
                disabled={respondingInvite}
                onPress={() => onRespondInvite?.("no")}
                className={cn(
                  "flex-1 items-center rounded-xl bg-muted py-1.5",
                  respondingInvite && "opacity-50"
                )}
              >
                <Text className="text-sm font-medium text-foreground">
                  {t("messages.no")}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

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
                  accessibilityValue={{ text: emoji }}
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
