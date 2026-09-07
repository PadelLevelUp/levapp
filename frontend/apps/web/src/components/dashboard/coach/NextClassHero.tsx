/**
 * The class about to start — the only gradient on the screen.
 *
 * It keeps the navy surface in BOTH themes, which is why every colour here
 * comes from the `sidebar` token family (navy in light AND dark) rather than
 * `card`/`foreground`, which invert. Using the inverse tokens would make the
 * text unreadable the moment a coach switches to dark.
 *
 * There is no empty state: the server omits the block when nothing is
 * scheduled, and the parent renders nothing.
 */
import type { DashboardNextClassBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "./primitives";
import { AnswerButtons } from "./AnswerButtons";
import { useAnswerReminder } from "./useAnswerReminder";
import { weekdayLong } from "@levelup/config";

export function NextClassHero({
  block,
  onAnswered,
}: {
  block: DashboardNextClassBlock;
  /** PAD-202 (student): refetch after answering the reminder from the hero. */
  onAnswered?: () => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const d = block.data;
  const { answer, busyId } = useAnswerReminder(onAnswered);
  const pending = d.pendingConfirmation === true && typeof d.lessonInstanceId === "number";

  const eyebrow = d.isToday
    ? t("dashboard.hero.upNext", { time: d.startTime })
    : t("dashboard.hero.nextClass", { weekday: weekdayLong(d.date, i18n.language) });

  return (
    // `sidebar-accent` is the lighter navy and `sidebar` the deeper one — the
    // two stops of the brand gradient, both of which stay navy in dark mode.
    <section
      data-testid="dashboard-next-class"
      className="rounded-2xl bg-sidebar bg-gradient-to-br from-sidebar-accent to-sidebar p-5 text-sidebar-foreground"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/70 tabular-nums">
          {eyebrow}
        </span>
        {d.minutesUntil !== null && (
          <span className="rounded-full bg-sidebar-primary/20 px-2.5 py-1 text-[11px] font-semibold text-sidebar-primary tabular-nums">
            {t("dashboard.hero.startsIn", { minutes: d.minutesUntil })}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <h2 className="font-display text-2xl font-bold tracking-tight">{d.title}</h2>
        <span className="text-[13px] text-sidebar-foreground/70 tabular-nums">
          {d.startTime} – {d.endTime}
        </span>
      </div>

      {/* A student asked to confirm answers right here (dashboard.blocks rule 3a). */}
      {pending && (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-[13px] font-semibold text-sidebar-foreground/90">
            {t("dashboard.schedule.toConfirm")}
          </span>
          <AnswerButtons
            className="flex items-center gap-2"
            onNavy
            busy={busyId === d.lessonInstanceId}
            onAnswer={(action) => answer(d.lessonInstanceId as number, action)}
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <AvatarStack people={d.players} total={d.filled} onNavy />
        <span className="text-[13px] text-sidebar-foreground/70 tabular-nums">
          {d.filled}/{d.capacity}
        </span>
        <span className="flex-1" />
        {/* h-11 = 44px touch target on mobile; sm density is desktop-only. */}
        <Button
          className="h-11 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 lg:h-10"
          onClick={() => navigate(d.href)}
        >
          {t("dashboard.hero.open")}
        </Button>
      </div>
    </section>
  );
}
