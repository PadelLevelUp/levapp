/**
 * The queue. Each item carries its own resolution, so the list can reach zero —
 * which a counter never could. Server order is fixed (empty seats soonest-first,
 * then replies, then validation), so this renders in the order it receives.
 *
 * Mobile: one card per row; the reply card has no buttons and the whole card
 * opens the thread. Desktop: two columns, the reply card gains inline actions
 * because the width is there, and a single-line card spans both columns so the
 * grid never leaves a ragged half-row.
 */
import type {
  DashboardNeedsYouBlock,
  DashboardNeedsYouEmptySeats,
  DashboardNeedsYouInvite,
  DashboardNeedsYouItem,
  DashboardNeedsYouReply,
  DashboardNeedsYouValidation,
  DashboardNeedsYouVacancyInvite,
  DashboardNeedsYouWaitingListOffer,
} from "@levelup/types";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { snoozeNeedsYouItem } from "@levelup/api/src/resources/dashboard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ActionCard, Eyebrow } from "./primitives";
import { AnswerButtons } from "./AnswerButtons";
import { useAnswerReminder } from "./useAnswerReminder";
import { useAnswerVacancyInvite, useAnswerWaitingListOffer } from "./useAnswerAsk";
import { shortDate } from "@levelup/config";

export function NeedsYouQueue({
  block,
  onAnswered,
}: {
  block: DashboardNeedsYouBlock;
  /**
   * Refetch after an in-place action: a student answering an invite (PAD-202),
   * a coach pressing "Later" on an empty-seats card (rule 3c). The card leaves
   * because the new payload says so.
   */
  onAnswered?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { items, count } = block.data;

  return (
    <section className="flex flex-col gap-2.5" data-testid="dashboard-needs-you">
      <div className="flex items-center justify-between px-1">
        <Eyebrow>{t("dashboard.needsYou.eyebrow", { count })}</Eyebrow>
      </div>

      {items.length === 0 ? (
        // One quiet sunken row. No illustration — an empty queue is a good
        // outcome, not an occasion.
        <div className="rounded-2xl bg-muted px-4 py-5 text-center text-sm text-muted-foreground">
          {t("dashboard.needsYou.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {items.map((item) => (
            <QueueItem key={item.id} item={item} onAnswered={onAnswered} />
          ))}
        </div>
      )}
    </section>
  );
}

function QueueItem({
  item,
  onAnswered,
}: {
  item: DashboardNeedsYouItem;
  onAnswered?: () => void | Promise<void>;
}) {
  switch (item.kind) {
    case "empty_seats":
      return <EmptySeatsCard item={item} onSnoozed={onAnswered} />;
    case "invite":
      return <InviteCard item={item} onAnswered={onAnswered} />;
    case "vacancy_invite":
      return <VacancyInviteCard item={item} onAnswered={onAnswered} />;
    case "waiting_list_offer":
      return <WaitingListOfferCard item={item} onAnswered={onAnswered} />;
    case "reply":
      return <ReplyCard item={item} />;
    case "validation":
      return <ValidationCard item={item} />;
    default:
      return null;
  }
}

function EmptySeatsCard({
  item,
  onSnoozed,
}: {
  item: DashboardNeedsYouEmptySeats;
  onSnoozed?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [snoozing, setSnoozing] = useState(false);

  // "Later" (dashboard.blocks rule 3c): the server hides this occurrence for
  // 24 hours on every device; the card goes when the refetched payload says so.
  const later = async () => {
    setSnoozing(true);
    try {
      await snoozeNeedsYouItem(item.id);
      await onSnoozed?.();
    } catch {
      toast({ description: t("dashboard.needsYou.laterFailed"), variant: "destructive" });
    } finally {
      setSnoozing(false);
    }
  };

  return (
    <ActionCard
      accent="attention"
      className="flex flex-col gap-3.5"
      testId={`needs-you-empty-seats-${item.id}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {t("dashboard.needsYou.emptySeats.title", {
            class: item.classTitle,
            count: item.seatsMissing,
          })}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {t("dashboard.needsYou.emptySeats.detail", {
            date: shortDate(item.date, i18n.language),
            time: item.timeLabel,
            filled: item.filled,
            capacity: item.capacity,
          })}
        </span>
      </div>
      <div className="flex gap-2">
        <Button className="h-11 flex-1 lg:h-10" onClick={() => navigate(item.href)}>
          {t("dashboard.needsYou.emptySeats.invite", { count: item.seatsMissing })}
        </Button>
        <Button
          variant="outline"
          className="h-11 lg:h-10"
          disabled={snoozing}
          onClick={later}
          data-testid="needs-you-later"
        >
          {t("dashboard.needsYou.later")}
        </Button>
      </div>
    </ActionCard>
  );
}

/**
 * PAD-202: the student's counterpart of the empty-seats card. Amber because it
 * is the student's to resolve — and it resolves right here: Yes / No record the
 * reminder answer (dashboard.blocks rule 3a); "Open" still lands on the class
 * (dashboard.navigation rule 8) for anyone who wants the detail first.
 */
function InviteCard({
  item,
  onAnswered,
}: {
  item: DashboardNeedsYouInvite;
  onAnswered?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { answer, busyId } = useAnswerReminder(onAnswered);
  const canAnswer = typeof item.lessonInstanceId === "number";

  return (
    <ActionCard accent="attention" className="flex flex-col gap-3.5" testId="dashboard-queue-invite">
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {t("dashboard.needsYou.invite.title", { class: item.classTitle })}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {t("dashboard.needsYou.invite.detail", {
            date: shortDate(item.date, i18n.language),
            time: item.timeLabel,
            filled: item.filled,
            capacity: item.capacity,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {canAnswer && (
          <AnswerButtons
            className="flex items-center gap-2"
            busy={busyId === item.lessonInstanceId}
            onAnswer={(action) => answer(item.lessonInstanceId as number, action)}
          />
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-9" onClick={() => navigate(item.href)}>
          {t("dashboard.needsYou.invite.open")}
        </Button>
      </div>
    </ActionCard>
  );
}

/**
 * PAD-236: the engine's "a spot opened" invitation, answered here with the same
 * Yes/No the chat bubble offers (`respondToNotification`). Amber: it is the
 * most time-sensitive ask a student gets.
 */
function VacancyInviteCard({
  item,
  onAnswered,
}: {
  item: DashboardNeedsYouVacancyInvite;
  onAnswered?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { answer, busyId } = useAnswerVacancyInvite(onAnswered);

  return (
    <ActionCard
      accent="attention"
      className="flex flex-col gap-3.5"
      testId="dashboard-queue-vacancy-invite"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {t("dashboard.needsYou.vacancyInvite.title", { class: item.classTitle })}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {t("dashboard.needsYou.vacancyInvite.detail", {
            date: shortDate(item.date, i18n.language),
            time: item.timeLabel,
            filled: item.filled,
            capacity: item.capacity,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AnswerButtons
          className="flex items-center gap-2"
          busy={busyId === item.notificationEventId}
          onAnswer={(action) => answer(item.notificationEventId, action)}
        />
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-9" onClick={() => navigate(item.href)}>
          {t("dashboard.needsYou.vacancyInvite.open")}
        </Button>
      </div>
    </ActionCard>
  );
}

/** PAD-236: the waiting-list offer, answered with `respondToWaitingList`. */
function WaitingListOfferCard({
  item,
  onAnswered,
}: {
  item: DashboardNeedsYouWaitingListOffer;
  onAnswered?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { answer, busyId } = useAnswerWaitingListOffer(onAnswered);

  return (
    <ActionCard
      accent="attention"
      className="flex flex-col gap-3.5"
      testId="dashboard-queue-waiting-list-offer"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {t("dashboard.needsYou.waitingListOffer.title", { class: item.classTitle })}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {t("dashboard.needsYou.waitingListOffer.detail", {
            date: shortDate(item.date, i18n.language),
            time: item.timeLabel,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <AnswerButtons
          className="flex items-center gap-2"
          busy={busyId === item.lessonInstanceId}
          onAnswer={(action) => answer(item.lessonInstanceId, action)}
        />
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-9" onClick={() => navigate(item.href)}>
          {t("dashboard.needsYou.waitingListOffer.open")}
        </Button>
      </div>
    </ActionCard>
  );
}

function ReplyCard({ item }: { item: DashboardNeedsYouReply }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = () => navigate(item.href);

  return (
    // Mobile has no buttons at all — the card IS the target, which keeps the
    // touch area far larger than 44px. Desktop adds inline actions but the card
    // stays clickable, so the behaviour never contradicts itself.
    <ActionCard accent="accent" className="flex items-center gap-3" onClick={open}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
        {item.initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">
          {t("dashboard.needsYou.reply.title", { name: item.personName })}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">
          {item.preview}
        </span>
      </div>
      <div className="hidden shrink-0 gap-2 lg:flex">
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {t("dashboard.needsYou.reply.open")}
        </Button>
      </div>
    </ActionCard>
  );
}

function ValidationCard({ item }: { item: DashboardNeedsYouValidation }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    // No accent: validation is a chore, not a problem. And it is a single line,
    // so on desktop it spans both columns rather than leaving a half-empty row.
    <ActionCard className="flex items-center gap-3.5 lg:col-span-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold tabular-nums">
          {t("dashboard.needsYou.validation.title", { count: item.count })}
        </span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {t("dashboard.needsYou.validation.detail", { count: item.classCount })}
        </span>
      </div>
      <Button variant="secondary" className="h-11 shrink-0 lg:h-10" onClick={() => navigate(item.href)}>
        {t("dashboard.needsYou.validation.review")}
      </Button>
    </ActionCard>
  );
}
