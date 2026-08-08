/**
 * The coach dashboard.
 *
 * Blocks are looked up by type rather than mapped in order, because the two
 * breakpoints arrange the SAME five blocks differently: mobile stacks them in
 * priority order; desktop splits them into a scrolling left column (the work)
 * and a sticky right column (the context). Neither breakpoint may show
 * something the other doesn't — only arrangement and density change, which is
 * why both branches below read from exactly the same four variables.
 *
 * `messages_overview` is intentionally not rendered. It still arrives in the
 * payload because the layout's unread badge feeds off it, but "Unread messages:
 * 0" as the largest card on the screen is the flaw this redesign removes.
 */
import type { DashboardBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { NeedsYouQueue } from "./coach/NeedsYouQueue";
import { NextClassHero } from "./coach/NextClassHero";
import { Schedule7Days } from "./coach/Schedule7Days";
import { WeekPulse } from "./coach/WeekPulse";
import { greetingKey, longDate } from "@levelup/config";
import { useIsDesktop } from "./coach/useIsDesktop";

/** Narrows the union by `type`, so each block keeps its own data shape. */
function pick<T extends DashboardBlock["type"]>(blocks: DashboardBlock[], type: T) {
  return blocks.find((b): b is Extract<DashboardBlock, { type: T }> => b.type === type);
}

export function CoachDashboard({
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
  const pulseBlock = pick(blocks, "week_pulse");

  // Rendered once each, then placed by the branch below.
  const hero = heroBlock ? <NextClassHero block={heroBlock} /> : null;
  const needsYou = needsYouBlock ? <NeedsYouQueue block={needsYouBlock} /> : null;
  const schedule = scheduleBlock ? <Schedule7Days block={scheduleBlock} /> : null;
  const pulse = pulseBlock ? <WeekPulse block={pulseBlock} /> : null;

  const greeting = t(`dashboard.greeting.${greetingKey()}`, { name: firstName });
  const today = longDate(new Date().toISOString().slice(0, 10), i18n.language);
  const needsCount = needsYouBlock?.data.count ?? 0;

  if (!isDesktop) {
    return (
      <div className="flex flex-col gap-5 p-4" data-testid="coach-dashboard">
        {/* On iOS this lives in the navy app bar. The web app bar is a shared
            white card used by every page, so the greeting sits at the top of
            the content instead — same orientation, same two lines, without
            special-casing AppLayout for one route. */}
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
        {pulse}
      </div>
    );
  }

  return (
    // Content caps at the page-max token so a week of classes never stretches
    // into an unreadable line on a wide monitor.
    <div
      className="mx-auto w-full max-w-[var(--page-max,1280px)]"
      data-testid="coach-dashboard"
    >
      {/* Desktop-only page header. On mobile the greeting lives in the navy app
          bar, so rendering it here too would be two headers saying one thing.
          The sidebar carries the logo and the account, so neither repeats. */}
      <header className="flex items-end justify-between gap-5 border-b border-border px-8 py-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display text-3xl font-bold tracking-tight">{greeting}</h1>
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {today}
            {needsCount > 0 && ` · ${t("dashboard.thingsNeedYou", { count: needsCount })}`}
          </span>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <Button variant="ghost" onClick={() => navigate("/calendar")}>
            {t("dashboard.today")}
          </Button>
          <Button onClick={() => navigate("/calendar?new=1")}>
            {t("dashboard.newClass")}
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
          {pulse}
        </aside>
      </div>
    </div>
  );
}
