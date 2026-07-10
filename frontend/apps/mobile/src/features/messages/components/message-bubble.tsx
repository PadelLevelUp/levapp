import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { Message, MessageStatus } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "../utils";
import type { ContextMenuAnchor } from "./message-context-menu";

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

// Right-swipe distance (px) past which releasing triggers reply mode.
const REPLY_TRIGGER_DISTANCE = 60;
// Max visual drag before the bubble stops following the finger.
const REPLY_MAX_DRAG = 80;

type MessageBubbleProps = {
  message: Message;
  /** True when the current user sent this message. */
  own: boolean;
  /** Current user id, to highlight reaction pills the user has toggled on
   * and to attribute the quoted reply preview ("You" vs participant name). */
  userId?: number;
  /** Name of the other participant, for the quoted reply preview. */
  participantName?: string;
  /** The message this one is replying to, if any (resolved by the caller). */
  replyToMessage?: Message;
  /** Briefly highlighted after scrolling here from a tapped reply quote. */
  isHighlighted?: boolean;
  /** Long-press opens the context menu (quick reactions + edit/delete).
   * Undefined disables the gesture (deleted / optimistic messages). */
  onLongPressMenu?: (message: Message, anchor: ContextMenuAnchor) => void;
  /** Swipe-right past the threshold enters reply mode for this message.
   * Undefined disables the gesture (deleted / optimistic messages). */
  onReply?: (message: Message) => void;
  /** Toggles the given emoji reaction on this message. */
  onReaction?: (emoji: string) => void;
  /** Tapping the quoted reply-preview block scrolls to the original. */
  onScrollToReply?: (messageId: string | number) => void;
  /** True while a respond-to-invite request for this message is in flight. */
  respondingInvite?: boolean;
  /** Fires when the user taps Yes/No on a notification_invite message. */
  onRespondInvite?: (action: "yes" | "no") => void;
};

/** Chat bubble: own messages right/brand-colored, others left/muted. */
export function MessageBubble({
  message,
  own,
  userId,
  participantName,
  replyToMessage,
  isHighlighted,
  onLongPressMenu,
  onReply,
  onReaction,
  respondingInvite,
  onRespondInvite,
  onScrollToReply,
}: MessageBubbleProps) {
  const { t } = useTranslation();

  // Notification-invite response area, mirrors web's MessageBubble.tsx
  // messageType === "notification_invite" block: own messages show a
  // "waiting" status line while unanswered, received invites get Yes/No.
  // The response is written straight into message.metadata by the caller
  // (see conversation/[id].tsx's handleRespondToInvite), so this component
  // just renders off message.metadata like any other steady-state field.
  const isInvite = message.messageType === "notification_invite";
  const alreadyResponded = !!message.metadata?.responded;
  const response = message.metadata?.response;

  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .enabled(!!onReply)
    .activeOffsetX(20)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      translateX.value = Math.max(0, Math.min(e.translationX, REPLY_MAX_DRAG));
    })
    .onEnd((e) => {
      if (e.translationX > REPLY_TRIGGER_DISTANCE && onReply) {
        runOnJS(onReply)(message);
      }
      translateX.value = withSpring(0, { damping: 16, stiffness: 180 });
    });

  const longPressGesture = Gesture.LongPress()
    .enabled(!!onLongPressMenu)
    .minDuration(450)
    .maxDistance(10)
    .onStart((e) => {
      if (onLongPressMenu) {
        runOnJS(onLongPressMenu)(message, { x: e.absoluteX, y: e.absoluteY });
      }
    });

  const composedGesture = Gesture.Race(longPressGesture, panGesture);

  const swipeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const replyIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [24, REPLY_TRIGGER_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  if (message.isDeleted) {
    return (
      <View className={cn("max-w-[80%]", own ? "self-end" : "self-start")}>
        <View
          className={cn(
            "rounded-2xl px-3 py-2",
            own ? "rounded-br-sm bg-muted" : "rounded-bl-sm bg-muted"
          )}
        >
          <Text className="text-base italic text-muted-foreground">
            {t("messages.messageDeleted")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={composedGesture}>
      {/* No `accessible`/`accessibilityLabel` on this container: labeling it
          collapses every child (reaction pills, respond buttons) into one
          iOS a11y node, hiding them from VoiceOver and Maestro. The message
          text is a visible Text child and is read natively. */}
      <Animated.View
        testID={`message-item-${message.id}`}
        style={swipeStyle}
        className={cn("max-w-[80%]", own ? "self-end" : "self-start")}
      >
        {/* Reply arrow revealed by the right-swipe, fixed to the right of
            the bubble (mirrors web's absolute left-full reply indicator). */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: "100%",
              top: "50%",
              marginTop: -16,
              marginLeft: 8,
            },
            replyIconStyle,
          ]}
        >
          <View className="h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Ionicons name="arrow-undo" size={16} color={lightTheme.primary} />
          </View>
        </Animated.View>

        <View
          className={cn("relative", message.reactions?.length ? "mb-3" : "")}
        >
          <View
            className={cn(
              "rounded-2xl px-3 py-2",
              own ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-muted",
              isHighlighted && "opacity-80"
            )}
          >
            {replyToMessage ? (
              <Pressable
                testID={`message-reply-quote-${message.id}`}
                accessibilityLabel={t("messages.reply")}
                role="button"
                disabled={!onScrollToReply}
                onPress={() => onScrollToReply?.(replyToMessage.id)}
                className={cn(
                  "mb-1.5 rounded-sm border-r-2 px-2.5 py-1",
                  own
                    ? "border-primary-foreground/40 bg-primary-foreground/10"
                    : "border-primary bg-foreground/5"
                )}
              >
                <Text
                  className={cn(
                    "text-right text-xs font-semibold",
                    own ? "text-primary-foreground opacity-80" : "text-muted-foreground"
                  )}
                >
                  {Number(replyToMessage.senderId) === userId
                    ? t("messages.you")
                    : participantName}
                </Text>
                <Text
                  numberOfLines={1}
                  className={cn(
                    "text-right text-xs",
                    own ? "text-primary-foreground opacity-80" : "text-muted-foreground"
                  )}
                >
                  {replyToMessage.isDeleted
                    ? t("messages.messageDeleted")
                    : replyToMessage.content}
                </Text>
              </Pressable>
            ) : null}

            <Text
              className={cn(
                "text-base",
                own ? "text-primary-foreground" : "text-foreground"
              )}
            >
              {message.content}
            </Text>

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
                "absolute -bottom-2.5 z-10 flex-row flex-wrap gap-1",
                own ? "right-2" : "left-2"
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
      </Animated.View>
    </GestureDetector>
  );
}
