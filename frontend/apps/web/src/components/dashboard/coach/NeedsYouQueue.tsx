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
} from "@levelup/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ActionCard, Eyebrow } from "./primitives";
import { AnswerButtons } from "./AnswerButtons";
import { useAnswerReminder } from "./useAnswerReminder";
import { shortDate } from "@levelup/config";

export function NeedsYouQueue({
  block,
  onAnswered,
}: {
  block: DashboardNeedsYouBlock;
  /** PAD-202 (student): refetch after answering an invite card. */
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
      return <EmptySeatsCard item={item} />;
    case "invite":
      return <InviteCard item={item} onAnswered={onAnswered} />;
    case "reply":
      return <ReplyCard item={item} />;
    case "validation":
      return <ValidationCard item={item} />;
    default:
      return null;
  }
}

function EmptySeatsCard({ item }: { item: DashboardNeedsYouEmptySeats }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  return (
    <ActionCard accent="attention" className="flex flex-col gap-3.5">
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
        <Button variant="outline" className="h-11 lg:h-10">
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
