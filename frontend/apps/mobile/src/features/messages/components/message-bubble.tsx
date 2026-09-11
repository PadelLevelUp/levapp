import { Ionicons } from "@expo/vector-icons";
import { classRequestBubbleState, lightTheme, type ClassRequestLive } from "@levelup/config";
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
import { approvalBundleFrom } from "@/features/notifications/approval-bundle";
import { ReplacementApprovalCard } from "@/features/notifications/replacement-approval-card";
import { reminderState } from "../reminder-state";
import { waitingListOfferState } from "../waiting-list-state";
import { formatMessageTime } from "../utils";
import type { ContextMenuAnchor } from "./message-context-menu";

// Mirrors web's hardcoded read-receipt blue (Tailwind's blue-300) — a
// one-off accent, not part of the @levelup/config design tokens.
const READ_ICON_COLOR = "#93c5fd";
// Accepted = done, which is the one job the success token has.
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
  /** True while a notification_reminder answer is in flight (PAD-151). */
  respondingReminder?: boolean;
  /** Fires when the user taps Yes/No on a notification_reminder message. */
  onRespondReminder?: (action: "yes" | "no") => void;
  /** Fires when a confirmed student cancels their attendance. */
  onCancelAttendance?: () => void;
  /** True while a waiting_list_offer answer is in flight (PAD-124). */
  respondingWaitingList?: boolean;
  /** Fires when the user taps Yes/No on a waiting_list_offer message. */
  onRespondWaitingList?: (action: "yes" | "no") => void;
  /** classes.class-requests rule 6 (PAD-281): the live row of the request a
   * proposal message is about — `undefined` while loading, `null` when the
   * list does not hold it. The bubble derives what it offers from this. */
  classRequestLive?: ClassRequestLive | null;
  /** True while an answer to the proposal is in flight. */
  respondingClassRequest?: boolean;
  /** Accept / decline the coach's proposal from the bubble. */
  onAnswerClassRequest?: (accept: boolean) => void;
  /** "Propose another time": opens the Availability picker on the request. */
  onCounterClassRequest?: () => void;
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
  respondingReminder,
  onRespondReminder,
  onCancelAttendance,
  respondingWaitingList,
  onRespondWaitingList,
  classRequestLive,
  respondingClassRequest,
  onAnswerClassRequest,
  onCounterClassRequest,
  onScrollToReply,
}: MessageBubbleProps) {
  const { t } = useTranslation();

  // PAD-281 / B-077: the coach's proposal is a question in chat, so its answers
  // live on this bubble. Same derivation as web's MessageBubble, off the
  // request's live row the screen fetches (class-request-message.ts).
  const classRequestMeta = message.metadata?.classRequest;
  const isClassRequestProposal =
    classRequestMeta?.kind === "proposed" || classRequestMeta?.kind === "countered";
  const classRequest = classRequestBubbleState(classRequestMeta, classRequestLive, { own });

  // Notification-invite response area, mirrors web's MessageBubble.tsx
  // messageType === "notification_invite" block: own messages show a
  // "waiting" status line while unanswered, received invites get Yes/No.
  // The response is written straight into message.metadata by the caller
  // (see conversation/[id].tsx's handleRespondToInvite), so this component
  // just renders off message.metadata like any other steady-state field.
  const isInvite = message.messageType === "notification_invite";
  const alreadyResponded = !!message.metadata?.responded;
  const response = message.metadata?.response;

  // PAD-151: attendance reminders were rendered with no buttons at all, so a
  // student could not answer one from the app. Its state rules (superseded,
  // late cancellation, already-answered) live in reminder-state.ts.
  const isReminder = message.messageType === "notification_reminder";
  const reminder = reminderState(message.metadata, null);

  // PAD-124: the `waiting_list_offer` sent on the "that spot was just filled"
  // path is the entire self-service route onto the waiting list, and neither
  // client rendered its Yes/No — so the endpoint behind it was unreachable.
  // Its state rules live in waiting-list-state.ts.
  const isWaitingListOffer = message.messageType === "waiting_list_offer";
  const waitingList = waitingListOfferState(message.metadata, null);

  // PAD-168: `replacement_approval` messages rendered as plain text on iOS, so
  // a coach could not complete a semi-automatic approval from the phone at
  // all. Web reads the bundle straight off metadata and guards on bundleId +
  // a non-empty vacancy list; that guard is `approvalBundleFrom`.
  const isReplacementApproval =
    message.messageType === "replacement_approval";
  const approvalBundle = isReplacementApproval
    ? approvalBundleFrom(message.metadata)
    : null;
  const [confirmingLateCancel, setConfirmingLateCancel] =
    React.useState(false);

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
                      accessibilityLabel={t("messages.reactionLabel", {
                        emoji,
                        count,
                      })}
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

        {/* Replacement-approval prompt, semi-automatic mode (PAD-168). Web
            renders it in exactly this slot — after the bubble, before the
            reminder area. Own messages are read-only: a coach looking at the
            copy they sent has nothing to approve on it. */}
        {approvalBundle ? (
          <View className="mt-1.5 self-start">
            <ReplacementApprovalCard bundle={approvalBundle} readOnly={own} />
          </View>
        ) : null}

        {/* Attendance-reminder response area (PAD-151), mirroring web's
            notification_reminder block. Own messages never get buttons — a
            coach's own reminder is not theirs to answer. */}
        {isReminder && !own ? (
          <View className="mt-1.5 flex-row flex-wrap gap-2 self-start">
            {reminder.confirmed ? (
              <>
                <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={ACCEPTED_ICON_COLOR}
                  />
                  <Text className="text-xs font-medium text-success">
                    {t("messages.confirmed")}
                  </Text>
                </View>

                {reminder.canCancel ? (
                  reminder.isLateCancellation && confirmingLateCancel ? (
                    <View className="w-full gap-1.5">
                      <View className="flex-row items-center gap-1.5">
                        <Ionicons
                          name="warning-outline"
                          size={14}
                          color={lightTheme.warning}
                        />
                        <Text className="flex-1 text-xs font-medium text-warning">
                          {t("messages.lateCancellationWarning")}
                        </Text>
                      </View>
                      <View className="flex-row gap-2">
                        <Pressable
                          testID="message-cancel-attendance-confirm"
                          accessibilityLabel={t("messages.cancelAttendance")}
                          role="button"
                          disabled={respondingReminder}
                          onPress={() => {
                            setConfirmingLateCancel(false);
                            onCancelAttendance?.();
                          }}
                          className={cn(
                            "flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5",
                            respondingReminder && "opacity-50"
                          )}
                        >
                          <Ionicons
                            name="close"
                            size={14}
                            color={lightTheme.destructive}
                          />
                          <Text className="text-xs font-medium text-destructive">
                            {t("messages.cancelAttendance")}
                          </Text>
                        </Pressable>
                        <Pressable
                          testID="message-cancel-attendance-abort"
                          accessibilityLabel={t("messages.no")}
                          role="button"
                          disabled={respondingReminder}
                          onPress={() => setConfirmingLateCancel(false)}
                          className={cn(
                            "rounded-full bg-muted px-3 py-1.5",
                            respondingReminder && "opacity-50"
                          )}
                        >
                          <Text className="text-xs font-medium text-foreground">
                            {t("messages.no")}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      testID="message-cancel-attendance"
                      accessibilityLabel={t("messages.cancelAttendance")}
                      role="button"
                      disabled={respondingReminder}
                      onPress={() =>
                        reminder.isLateCancellation
                          ? setConfirmingLateCancel(true)
                          : onCancelAttendance?.()
                      }
                      className={cn(
                        "flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5",
                        respondingReminder && "opacity-50"
                      )}
                    >
                      <Ionicons
                        name="close"
                        size={14}
                        color={lightTheme.mutedForeground}
                      />
                      <Text className="text-xs font-medium text-foreground">
                        {t("messages.cancelAttendance")}
                      </Text>
                    </Pressable>
                  )
                ) : null}
              </>
            ) : reminder.declined ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5">
                <Ionicons name="close" size={14} color={lightTheme.destructive} />
                <Text className="text-xs font-medium text-destructive">
                  {t("messages.absent")}
                </Text>
              </View>
            ) : reminder.superseded ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 opacity-70">
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={lightTheme.mutedForeground}
                />
                <Text className="text-xs font-medium text-muted-foreground">
                  {t("messages.reminderExpired")}
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  testID="message-reminder-yes"
                  accessibilityLabel={t("messages.yes")}
                  role="button"
                  disabled={respondingReminder}
                  onPress={() => onRespondReminder?.("yes")}
                  className={cn(
                    "flex-1 items-center rounded-xl bg-primary py-1.5",
                    respondingReminder && "opacity-50"
                  )}
                >
                  <Text className="text-sm font-medium text-primary-foreground">
                    {t("messages.yes")}
                  </Text>
                </Pressable>
                <Pressable
                  testID="message-reminder-no"
                  accessibilityLabel={t("messages.no")}
                  role="button"
                  disabled={respondingReminder}
                  onPress={() => onRespondReminder?.("no")}
                  className={cn(
                    "flex-1 items-center rounded-xl bg-muted py-1.5",
                    respondingReminder && "opacity-50"
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

        {/* Waiting-list offer response area (PAD-124), mirroring web's
            waiting_list_offer block. Own messages never get buttons — the
            coach's own offer is not theirs to answer; they see the same
            "waiting for response" line the invite bubble shows them. */}
        {isWaitingListOffer ? (
          <View
            className={cn(
              "mt-1.5 flex-row flex-wrap gap-2",
              own ? "self-end" : "self-start"
            )}
          >
            {waitingList.joined ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={ACCEPTED_ICON_COLOR}
                />
                <Text className="text-xs font-medium text-success">
                  {t("messages.waitingListJoined")}
                </Text>
              </View>
            ) : waitingList.declined ? (
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
            ) : waitingList.expired ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 opacity-70">
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={lightTheme.mutedForeground}
                />
                <Text className="text-xs font-medium text-muted-foreground">
                  {t("messages.waitingListOfferExpired")}
                </Text>
              </View>
            ) : own ? (
              <Text className="text-xs italic text-muted-foreground">
                {t("messages.waitingForResponse")}
              </Text>
            ) : (
              <>
                <Pressable
                  testID="message-waiting-list-yes"
                  accessibilityLabel={t("messages.yes")}
                  role="button"
                  disabled={respondingWaitingList}
                  onPress={() => onRespondWaitingList?.("yes")}
                  className={cn(
                    "flex-1 items-center rounded-xl bg-primary py-1.5",
                    respondingWaitingList && "opacity-50"
                  )}
                >
                  <Text className="text-sm font-medium text-primary-foreground">
                    {t("messages.yes")}
                  </Text>
                </Pressable>
                <Pressable
                  testID="message-waiting-list-no"
                  accessibilityLabel={t("messages.no")}
                  role="button"
                  disabled={respondingWaitingList}
                  onPress={() => onRespondWaitingList?.("no")}
                  className={cn(
                    "flex-1 items-center rounded-xl bg-muted py-1.5",
                    respondingWaitingList && "opacity-50"
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

        {/* Class-request proposal (classes.class-requests rule 6, PAD-281),
            mirroring web's block: the student answers here or goes to pick
            another time; the coach sees it waiting; a decided or superseded
            proposal shows where it ended up. */}
        {isClassRequestProposal && classRequest.kind !== "none" ? (
          <View
            testID={`class-request-proposal-actions-${classRequestMeta?.id ?? ""}`}
            accessibilityValue={{ text: classRequest.kind }}
            className={cn("mt-1.5 gap-2", own ? "self-end" : "self-start")}
          >
            {classRequest.kind === "actions" ? (
              <>
                <View className="flex-row gap-2">
                  <Pressable
                    testID="class-request-bubble-accept"
                    accessibilityLabel={t("classRequests.bubble.accept")}
                    role="button"
                    disabled={respondingClassRequest}
                    onPress={() => onAnswerClassRequest?.(true)}
                    className={cn(
                      "flex-1 items-center rounded-xl bg-primary px-3 py-1.5",
                      respondingClassRequest && "opacity-50"
                    )}
                  >
                    <Text className="text-sm font-medium text-primary-foreground">
                      {t("classRequests.bubble.accept")}
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="class-request-bubble-decline"
                    accessibilityLabel={t("classRequests.bubble.decline")}
                    role="button"
                    disabled={respondingClassRequest}
                    onPress={() => onAnswerClassRequest?.(false)}
                    className={cn(
                      "flex-1 items-center rounded-xl bg-muted px-3 py-1.5",
                      respondingClassRequest && "opacity-50"
                    )}
                  >
                    <Text className="text-sm font-medium text-foreground">
                      {t("classRequests.bubble.decline")}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  testID="class-request-bubble-propose"
                  accessibilityLabel={t("classRequests.bubble.propose")}
                  role="button"
                  disabled={respondingClassRequest}
                  onPress={() => onCounterClassRequest?.()}
                  className={cn(
                    "items-center rounded-xl border border-border bg-background px-3 py-1.5",
                    respondingClassRequest && "opacity-50"
                  )}
                >
                  <Text className="text-sm font-medium text-foreground">
                    {t("classRequests.bubble.propose")}
                  </Text>
                </Pressable>
              </>
            ) : classRequest.kind === "waiting" ? (
              <Text className="text-xs italic text-muted-foreground">
                {t(
                  classRequestMeta?.kind === "proposed"
                    ? "classRequests.bubble.waiting"
                    : "classRequests.bubble.outcome.pending"
                )}
              </Text>
            ) : classRequest.kind === "superseded" ? (
              <View className="flex-row items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 opacity-70">
                <Ionicons name="time-outline" size={14} color={lightTheme.mutedForeground} />
                <Text className="text-xs font-medium text-muted-foreground">
                  {t("classRequests.bubble.superseded")}
                </Text>
              </View>
            ) : (
              <View
                className={cn(
                  "flex-row items-center gap-1.5 rounded-full px-3 py-1.5",
                  classRequest.status === "accepted" ? "bg-success/15" : "bg-muted"
                )}
              >
                <Ionicons
                  name={classRequest.status === "accepted" ? "checkmark" : "close"}
                  size={14}
                  color={classRequest.status === "accepted" ? ACCEPTED_ICON_COLOR : lightTheme.mutedForeground}
                />
                <Text
                  className={cn(
                    "text-xs font-medium",
                    classRequest.status === "accepted" ? "text-success" : "text-muted-foreground"
                  )}
                >
                  {t(`classRequests.bubble.outcome.${classRequest.status ?? "pending"}`)}
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {isInvite ? (
          <View
            className={cn(
              "mt-1.5 flex-row gap-2",
              own ? "self-end" : "self-start"
            )}
          >
            {alreadyResponded ? (
              response === "yes" ? (
                <View className="flex-row items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5">
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={ACCEPTED_ICON_COLOR}
                  />
                  <Text className="text-xs font-medium text-success">
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
                <View className="rounded-full bg-warning/15 px-3 py-1.5">
                  <Text className="text-xs font-medium text-warning">
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
