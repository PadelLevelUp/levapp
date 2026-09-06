/**
 * The student dashboard (PAD-202).
 *
 * Built from the same blocks as the coach home — hero, needs-you queue, the
 * week ahead — plus the student's own four numbers, so the two roles never
 * look like two apps. As on the coach side, blocks are looked up by type and
 * rendered exactly once: mobile stacks them in priority order, desktop splits
 * the work (queue, schedule) from the context (hero, KPIs). Both branches read
 * the same four variables, so neither breakpoint can show something the other
 * doesn't.
 *
 * `messages_overview` is not rendered here either; an unread message reaches
 * the student as a `reply` card in the queue.
 */
import type { DashboardBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { KpiTiles } from "./coach/KpiTiles";
import { NeedsYouQueue } from "./coach/NeedsYouQueue";
import { NextClassHero } from "./coach/NextClassHero";
import { Schedule7Days } from "./coach/Schedule7Days";
import { greetingKey, longDate, todayISO } from "@levelup/config";
import { useIsDesktop } from "./coach/useIsDesktop";

function pick<T extends DashboardBlock["type"]>(blocks: DashboardBlock[], type: T) {
  return blocks.find((b): b is Extract<DashboardBlock, { type: T }> => b.type === type);
}

export function StudentDashboard({
  blocks,
  firstName,
}: {
  blocks: DashboardBlock[];
  firstName: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const heroBlock = pick(blocks, "next_class");
  const needsYouBlock = pick(blocks, "needs_you");
  const scheduleBlock = pick(blocks, "schedule_7d");
  const kpiBlock = pick(blocks, "kpi_grid");

  const hero = heroBlock ? <NextClassHero block={heroBlock} /> : null;
  const needsYou = needsYouBlock ? <NeedsYouQueue block={needsYouBlock} /> : null;
  const schedule = scheduleBlock ? <Schedule7Days block={scheduleBlock} role="student" /> : null;
  const kpis = kpiBlock ? <KpiTiles block={kpiBlock} /> : null;

  const greeting = t(`dashboard.greeting.${greetingKey()}`, { name: firstName });
  const today = longDate(todayISO(), i18n.language);
  const needsCount = needsYouBlock?.data.count ?? 0;

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5 p-4" data-testid="student-dashboard">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-2xl font-bold tracking-tight">{greeting}</h1>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {today}
            {needsCount > 0 && ` · ${t("dashboard.thingsNeedYou", { count: needsCount })}`}
          </span>
        </div>
        {hero}
        {needsYou}
        {schedule}
        {kpis}
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-[var(--page-max,1280px)]"
      data-testid="student-dashboard"
    >
      <header className="flex items-end justify-between gap-5 border-b border-border px-8 py-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-3xl font-bold tracking-tight">{greeting}</h1>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {today}
            {needsCount > 0 && ` · ${t("dashboard.thingsNeedYou", { count: needsCount })}`}
          </span>
        </div>
        {/* One action, not two: a student has nothing to create from here. */}
        <div className="flex shrink-0 gap-2.5">
          <Button variant="ghost" onClick={() => navigate("/calendar")}>
            {t("dashboard.schedule.calendar")}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1.35fr)_400px] items-start gap-7 p-8">
        <div className="flex min-w-0 flex-col gap-6">
          {needsYou}
          {schedule}
        </div>
        <aside className="sticky top-6 flex flex-col gap-6">
          {hero}
          {kpis}
        </aside>
      </div>
    </div>
  );
}
