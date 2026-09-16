import { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Check, CheckCheck, Clock, AlertCircle, Reply, X, AlertTriangle, MinusCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApprovalBundle, Message, MessageStatus } from '@/types';
import { MessageActionMenu } from './MessageActionMenu';
import { ReportMessageDialog } from './ReportMessageDialog';
import { ReplacementApprovalCard } from '@/components/notifications/ReplacementApprovalCard';
import { respondToNotification, respondToReminder, cancelAttendance, respondToWaitingList } from '@/api/notificationEngine';
import { reminderAnswerOutcome, reminderRecordedState } from './reminder-answer';
import { toast } from 'sonner';
import { lisbonNowMs, wallClockISOMs } from "@levelup/config";
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@levelup/hooks';
import { classRequestBubbleState } from '@levelup/config';
import { acceptClassRequest, answerClassRequestProposal, classRequestRefusal, declineClassRequest, listClassRequests } from '@/api/classRequests';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  message: Message;
  isMine: boolean;
  userId: number;
  participantName: string;
  isHighlighted?: boolean;
  showTail?: boolean;
  replyToMessage?: Message;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  onReaction: (msgId: string, emoji: string) => void;
  onScrollToMessage?: (msgId: string) => void;
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sending':   return <Clock       className="h-3 w-3 text-primary-foreground/80" />;
    case 'sent':      return <Check       className="h-3 w-3 text-primary-foreground/60" />;
    case 'delivered': return <CheckCheck  className="h-3 w-3 text-primary-foreground/60" />;
    case 'read':      return <CheckCheck  className="h-3 w-3 text-blue-300" />;
    case 'failed':    return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:          return null;
  }
}

export function MessageBubble({
  message, isMine, userId, participantName, isHighlighted, showTail, replyToMessage,
  onReply, onEdit, onDelete, onReaction, onScrollToMessage,
}: Props) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [reportOpen, setReportOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  // PAD-124: 'expired' is set only by the waiting-list offer, whose backend can
  // reject a late answer (PAD-68) — the invite and reminder branches never see it.
  const [localResponse, setLocalResponse] = useState<'accepted' | 'declined' | 'not_enrolled' | 'expired' | null>(null);
  // PAD-46: when the cancellation deadline has passed, require an explicit
  // confirmation of the "late cancellation" before cancelling (still allowed).
  const [confirmingLateCancel, setConfirmingLateCancel] = useState(false);

  const isInvite = message.messageType === "notification_invite";
  const isReminder = message.messageType === "notification_reminder";
  const isReplacementApproval = message.messageType === "replacement_approval";
  // PAD-124: the offer sent on the "that spot was just filled" path is the whole
  // self-service route onto the waiting list, and it rendered as plain text — so
  // `POST /app/notify/respond_waiting_list` had no caller in either client.
  const isWaitingListOffer = message.messageType === "waiting_list_offer";
  const alreadyResponded = !!message.metadata?.responded;

  const approvalBundle = isReplacementApproval
    ? (message.metadata as unknown as ApprovalBundle | undefined)
    : undefined;

  // classes.class-requests rule 6 (PAD-281, B-077): the coach's proposal is a
  // question in chat, so its answers live on this bubble. What it offers is
  // derived from the request's LIVE row (the request moves on; the bubble does
  // not), which is why the list is fetched here and refreshed by
  // `class_request_changed` in AppLayout. A stale answer gets the server's 409
  // and the bubble re-reads — never an error page.
  // `proposed` is the coach's proposal (the student answers); `counter_proposal` is
  // the student's counter-proposal (the coach answers, rule 10).
  const classRequestMeta = message.metadata?.classRequest;
  const isClassRequestProposal = classRequestMeta?.kind === "proposed" || classRequestMeta?.kind === "counter_proposal";
  const studentAnswers = classRequestMeta?.kind === "proposed";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const liveRequests = useQuery({
    queryKey: queryKeys.classRequests,
    queryFn: listClassRequests,
    enabled: isClassRequestProposal,
  });
  const liveRequest = liveRequests.data === undefined
    ? undefined
    : (liveRequests.data.find((r) => r.id === classRequestMeta?.id) ?? null);
  const classRequestState = classRequestBubbleState(classRequestMeta, liveRequest, { own: isMine });

  const handleAnswerProposal = async (accept: boolean) => {
    if (!classRequestMeta || responding) return;
    setResponding(true);
    try {
      // The slot the bubble shows travels with the answer (rule 5): a stale bubble gets 409 slot_changed.
      if (studentAnswers) await answerClassRequestProposal(classRequestMeta.id, accept, classRequestMeta.slot);
      else if (accept) await acceptClassRequest(classRequestMeta.id, classRequestMeta.slot);
      else await declineClassRequest(classRequestMeta.id);
      toast.success(t(accept ? "classRequests.accepted" : studentAnswers ? "classRequests.answered" : "classRequests.declined"));
    } catch (err) {
      const refusal = classRequestRefusal(err);
      toast.error(refusal ? t(`classRequests.refusal.${refusal.code}`) : t("messages.somethingWentWrong"));
    } finally {
      setResponding(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.classRequests });
    }
  };

  const handleRespond = async (action: "yes" | "no") => {
    const eventId = message.metadata?.notificationEventId;
    if (!eventId || responding) return;
    setResponding(true);
    try {
      const result = await respondToNotification(eventId, action);
      if (result.action === "spot_filled") {
        toast.info(t("messages.spotJustFilled"));
        setLocalResponse('declined');
      } else if (result.action === "confirmed") {
        setLocalResponse('accepted');
      } else if (result.action === "declined") {
        setLocalResponse('declined');
      }
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setResponding(false);
    }
  };

  const handleRespondReminder = async (action: "yes" | "no") => {
    const instanceId = message.metadata?.lessonInstanceId;
    if (!instanceId || responding) return;
    setResponding(true);
    try {
      const result = await respondToReminder(instanceId, action);
      // Trust the SERVER's action, not the tap (PAD-68 "expired" records
      // nothing; PAD-259 "not_enrolled" settles without an absent badge).
      const outcome = reminderAnswerOutcome(result.action);
      if (outcome.toastKey) toast.error(t(outcome.toastKey));
      if (outcome.local !== null) setLocalResponse(outcome.local);
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setResponding(false);
    }
  };
  // PAD-124: answering the waiting-list offer. Same shape as the reminder, but
  // the server can also answer "unknown" (the instance has no coach), which
  // records nothing — so, like PAD-68's "expired", it must not paint a badge.
  const handleRespondWaitingList = async (action: "yes" | "no") => {
    const instanceId = message.metadata?.lessonInstanceId;
    if (!instanceId || responding) return;
    setResponding(true);
    try {
      const result = await respondToWaitingList(instanceId, action);
      if (result.action === "expired") {
        toast.error(t("messages.waitingListOfferExpired"));
        setLocalResponse('expired');
        return;
      }
      if (result.action === "added_to_waiting_list") {
        setLocalResponse('accepted');
      } else if (result.action === "declined") {
        setLocalResponse('declined');
      } else {
        toast.error(t("messages.somethingWentWrong"));
      }
    } catch {
      toast.error(t("messages.somethingWentWrong"));
    } finally {
      setResponding(false);
    }
  };

  const handleCancelAttendance = async () => {
    const instanceId = message.metadata?.lessonInstanceId;
    if (!instanceId || responding) return;
    setResponding(true);
    try {
      await cancelAttendance(instanceId);
      setLocalResponse('declined');
      toast.success(t("messages.attendanceCancelled"));
    } catch {
      toast.error(t("messages.cancelAttendanceFailed"));
    } finally {
      setResponding(false);
    }
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [40, 80], [0, 1]);
  const hasSwipedRef = useRef(false);

  const handlePanEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 60 && !hasSwipedRef.current) {
      hasSwipedRef.current = true;
      onReply(message);
      setTimeout(() => { hasSwipedRef.current = false; }, 300);
    }
  };

  const openMenuAt = (clientX: number, clientY: number) => {
    setMenuPosition({ x: clientX, y: clientY });
    setMenuOpen(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const tx = touch.clientX;
    const ty = touch.clientY;
    longPressTimer.current = setTimeout(() => openMenuAt(tx, ty), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if (message.isDeleted) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-3 ${showTail ? 'mt-2.5' : 'mt-1.5'}`}>
        <div className={`rounded-2xl px-3.5 py-2 italic text-sm text-muted-foreground bg-muted border border-border shadow-sm ${
          isMine ? (showTail ? 'rounded-br-md' : '') : (showTail ? 'rounded-bl-md' : '')
        }`}>
          {t("messages.messageDeleted")}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-3 ${showTail ? 'mt-2.5' : 'mt-1.5'}`}>
      <motion.div
        className={`relative max-w-[80%] md:max-w-[65%] ${message.reactions?.length ? 'pb-4' : ''}`}
        drag="x"
        dragConstraints={{ left: 0, right: 80 }}
        dragElastic={0.1}
        onDragEnd={handlePanEnd}
        style={{ x }}
        whileDrag={{ cursor: 'grabbing' }}
        dragSnapToOrigin
      >
        {/* Reply indicator on swipe */}
        <motion.div
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2"
          style={{ opacity: replyOpacity }}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Reply className="h-4 w-4 text-primary" />
          </div>
        </motion.div>

        <div
          onContextMenu={e => { e.preventDefault(); openMenuAt(e.clientX, e.clientY); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          className={`relative rounded-2xl px-3.5 py-2 animate-message-in transition-all duration-200 ${
            menuOpen ? 'ring-2 ring-primary/40 scale-[1.02]' : ''
          } ${
            isHighlighted ? 'brightness-95' : ''
          } ${
            isMine
              ? `bg-primary text-primary-foreground ${showTail ? 'rounded-br-md' : ''}`
              : `bg-muted shadow-sm ${showTail ? 'rounded-bl-md' : ''}`
          }`}
        >
          {/* Reply preview */}
          {replyToMessage && (
            <button
              onClick={() => onScrollToMessage?.(String(replyToMessage.id))}
              className={`block w-full text-left mb-1.5 px-2.5 py-1.5 border-l-[3px] rounded-lg text-xs transition-colors ${
                isMine
                  // A LIGHTER wash, not a heavier one: the quote text is
                  // primary-foreground, which is designed to contrast with
                  // primary — so the closer the wash stays to the bubble, the
                  // better it reads. /20 measured 4.18:1; /12 gives 4.9 light
                  // and 5.54 dark. A dark scrim would invert on the dark theme,
                  // where the bubble is light blue and the text is dark.
                  ? 'border-primary-foreground/60 text-primary-foreground bg-primary-foreground/20 hover:bg-primary-foreground/25'
                  : 'border-primary text-foreground/80 bg-foreground/10 hover:bg-foreground/[0.14]'
              }`}
            >
              <span className="font-semibold block">
                {Number(replyToMessage.senderId) === Number(userId) ? t('messages.you') : participantName}
              </span>
              <span className="line-clamp-1">{replyToMessage.content}</span>
            </button>
          )}

          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>

          <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {message.edited && (
              <span className={`text-[10px] ${isMine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                {t('messages.edited')}
              </span>
            )}
            <span className={`text-[10px] ${isMine ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
              {formatTime(message.timestamp)}
            </span>
            {isMine && message.status && <StatusIcon status={message.status} />}
          </div>
        </div>

        {/* Notification invite response area */}
        {isInvite && (
          <div className="flex gap-2 mt-1.5 ml-1">
            {localResponse === 'accepted' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success">
                <Check className="w-3.5 h-3.5" />
                {t("messages.accepted")}
              </span>
            ) : localResponse === 'declined' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
                <X className="w-3.5 h-3.5" />
                {t("messages.declined")}
              </span>
            ) : alreadyResponded ? (
              message.metadata?.response === "yes" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success">
                  <Check className="w-3.5 h-3.5" />
                  {t("messages.accepted")}
                </span>
              ) : message.metadata?.response === "no" ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
                  <X className="w-3.5 h-3.5" />
                  {t("messages.declined")}
                </span>
              ) : (
                <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-warning/15 text-warning">
                  {t("messages.spotFilled")}
                </span>
              )
            ) : isMine ? (
              <span className="text-xs text-muted-foreground italic">{t("messages.waitingForResponse")}</span>
            ) : (
              <>
                <button
                  onClick={() => handleRespond("yes")}
                  disabled={responding}
                  className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
                >
                  {responding ? "…" : t("messages.yes")}
                </button>
                <button
                  onClick={() => handleRespond("no")}
                  disabled={responding}
                  className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
                >
                  {t("messages.no")}
                </button>
              </>
            )}
          </div>
        )}

        {/* Replacement approval prompt (semi-automatic mode) */}
        {approvalBundle?.bundleId && approvalBundle.vacancies?.length > 0 && (
          <div className="mt-1.5 ml-1">
            <ReplacementApprovalCard bundle={approvalBundle} readOnly={isMine} />
          </div>
        )}

        {/* Reminder response area */}
        {isReminder && !isMine && (() => {
          const { confirmed, declined, notEnrolled } = reminderRecordedState(
            message.metadata,
            localResponse
          );
          const startsAt = message.metadata?.startsAt;
          // Offer cancellation only while the class is still in the future.
          const classInFuture = !startsAt || wallClockISOMs(startsAt) > lisbonNowMs();
          // PAD-49: a newer reminder for the same class supersedes this one → its
          // Yes/No buttons stop being actionable and show an "expired" indicator.
          // PAD-68: a reminder for a class that has already started is expired for
          // the same reason — answering it can no longer change anything, and the
          // backend rejects late responses. Deriving this from startsAt also
          // retires reminders already sitting in history, with no data migration.
          const superseded = !!message.metadata?.superseded || !classInFuture;
          // PAD-46: past the coach's cancellation deadline (but before start) the
          // cancel is still allowed, but we warn it counts as a late cancellation.
          // The deadline is absent on older reminders → no warning, same as before.
          const deadlineIso = message.metadata?.cancellationDeadline;
          const isLateCancellation =
            !!deadlineIso && wallClockISOMs(deadlineIso) <= lisbonNowMs();

          return (
            <div className="flex flex-wrap gap-2 mt-1.5 ml-1">
              {confirmed ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success">
                    <Check className="w-3.5 h-3.5" />
                    {t("messages.confirmed")}
                  </span>
                  {classInFuture && (
                    isLateCancellation && confirmingLateCancel ? (
                      <div className="flex flex-col gap-1.5 w-full">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {t("messages.lateCancellationWarning")}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelAttendance}
                            disabled={responding}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            {responding ? "…" : t("messages.cancelAttendance")}
                          </button>
                          <button
                            onClick={() => setConfirmingLateCancel(false)}
                            disabled={responding}
                            className="inline-flex items-center text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-foreground disabled:opacity-50 transition-colors"
                          >
                            {t("messages.no")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() =>
                          isLateCancellation
                            ? setConfirmingLateCancel(true)
                            : handleCancelAttendance()
                        }
                        disabled={responding}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        {responding ? "…" : t("messages.cancelAttendance")}
                      </button>
                    )
                  )}
                </>
              ) : notEnrolled ? (
                <span
                  data-testid="message-reminder-not-enrolled"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground opacity-70"
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  {t("messages.reminderNotEnrolled")}
                </span>
              ) : declined ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
                  <X className="w-3.5 h-3.5" />
                  {t("messages.absent")}
                </span>
              ) : superseded ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground opacity-70">
                  <Clock className="w-3.5 h-3.5" />
                  {t("messages.reminderExpired")}
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleRespondReminder("yes")}
                    disabled={responding}
                    className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
                  >
                    {responding ? "…" : t("messages.yes")}
                  </button>
                  <button
                    onClick={() => handleRespondReminder("no")}
                    disabled={responding}
                    className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
                  >
                    {t("messages.no")}
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* Waiting-list offer response area (PAD-124). The coach sees their own
            offer as "waiting for response"; the student gets the Yes/No that
            makes `respond_waiting_list` reachable at all. */}
        {isWaitingListOffer && (() => {
          const joined =
            localResponse === 'accepted' ||
            (localResponse === null && alreadyResponded && message.metadata?.response === "yes");
          // PAD-68: the class already started, so the offer can no longer be
          // taken up. The server records "expired" rather than an answer.
          const expired =
            localResponse === 'expired' ||
            (localResponse === null && alreadyResponded && message.metadata?.response === "expired");
          // Same asymmetry as the reminder: any recorded answer that is neither
          // "yes" nor "expired" reads as declined, so an unrecognised value
          // fails safe to "not queued" rather than promising a place on a list.
          const declined =
            !joined && !expired &&
            (localResponse === 'declined' || (localResponse === null && alreadyResponded));

          return (
            <div className="flex flex-wrap gap-2 mt-1.5 ml-1" data-testid="waiting-list-offer-actions">
              {joined ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-success/15 text-success">
                  <Check className="w-3.5 h-3.5" />
                  {t("messages.waitingListJoined")}
                </span>
              ) : declined ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-destructive/15 text-destructive">
                  <X className="w-3.5 h-3.5" />
                  {t("messages.declined")}
                </span>
              ) : expired ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground opacity-70">
                  <Clock className="w-3.5 h-3.5" />
                  {t("messages.waitingListOfferExpired")}
                </span>
              ) : isMine ? (
                <span className="text-xs text-muted-foreground italic">{t("messages.waitingForResponse")}</span>
              ) : (
                <>
                  <button
                    onClick={() => handleRespondWaitingList("yes")}
                    disabled={responding}
                    className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
                  >
                    {responding ? "…" : t("messages.yes")}
                  </button>
                  <button
                    onClick={() => handleRespondWaitingList("no")}
                    disabled={responding}
                    className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
                  >
                    {t("messages.no")}
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* Class-request proposal (classes.class-requests rule 6, PAD-281). The
            student answers here — accept, decline, or go and pick another time;
            the coach sees their proposal waiting; a decided or superseded one
            shows where it ended up. */}
        {isClassRequestProposal && classRequestState.kind !== "none" && classRequestMeta && (
          <div
            className="flex flex-wrap gap-2 mt-1.5 ml-1"
            data-testid="class-request-proposal-actions"
            data-state={classRequestState.kind}
            data-request-id={classRequestMeta.id}
          >
            {classRequestState.kind === "actions" ? (
              <>
                <button
                  onClick={() => handleAnswerProposal(true)}
                  disabled={responding}
                  className="flex-1 py-1.5 px-3 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
                  data-testid="class-request-bubble-accept"
                >
                  {responding ? "…" : t("classRequests.bubble.accept")}
                </button>
                <button
                  onClick={() => handleAnswerProposal(false)}
                  disabled={responding}
                  className="flex-1 py-1.5 px-3 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
                  data-testid="class-request-bubble-decline"
                >
                  {t("classRequests.bubble.decline")}
                </button>
                <button
                  onClick={() => navigate(`${studentAnswers ? "/availability" : "/class-requests"}?proposeFor=${classRequestMeta.id}`)}
                  disabled={responding}
                  className="w-full py-1.5 px-3 text-sm font-medium rounded-xl border border-border bg-background text-foreground disabled:opacity-50 transition-opacity"
                  data-testid="class-request-bubble-propose"
                >
                  {t("classRequests.bubble.propose")}
                </button>
              </>
            ) : classRequestState.kind === "waiting" ? (
              <span className="text-xs text-muted-foreground italic">
                {t(studentAnswers ? "classRequests.bubble.waiting" : "classRequests.bubble.outcome.pending")}
              </span>
            ) : classRequestState.kind === "superseded" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground opacity-70">
                <Clock className="w-3.5 h-3.5" />
                {t("classRequests.bubble.superseded")}
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${
                  classRequestState.status === "accepted" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                }`}
              >
                {classRequestState.status === "accepted" ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                {t(`classRequests.bubble.outcome.${classRequestState.status ?? "pending"}`)}
              </span>
            )}
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`absolute bottom-0 z-10 flex flex-wrap gap-1 ${isMine ? 'right-2 justify-end' : 'left-2 justify-start'}`}>
            {Array.from(new Set(message.reactions.map(r => r.emoji))).map(emoji => {
              const count = message.reactions!.filter(r => r.emoji === emoji).length;
              return (
                <button
                  key={emoji}
                  onClick={() => onReaction(String(message.id), emoji)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-card border border-border shadow-sm text-xs hover:bg-accent transition-colors"
                >
                  <span>{emoji}</span>
                  {count > 1 && <span className="text-muted-foreground">{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {menuOpen && (
          <MessageActionMenu
            isMine={isMine}
            position={menuPosition}
            onClose={() => setMenuOpen(false)}
            onReply={() => { setMenuOpen(false); onReply(message); }}
            onEdit={isMine ? () => { setMenuOpen(false); onEdit(message); } : undefined}
            onDelete={isMine ? () => { setMenuOpen(false); onDelete(String(message.id)); } : undefined}
            onCopy={() => { navigator.clipboard.writeText(message.content ?? ''); setMenuOpen(false); }}
            onReport={() => { setMenuOpen(false); setReportOpen(true); }}
            onReaction={(emoji) => { onReaction(String(message.id), emoji); setMenuOpen(false); }}
          />
        )}

        <ReportMessageDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          messageId={String(message.id)}
        />
      </motion.div>
    </div>
  );
}
