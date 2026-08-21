/**
 * The week ahead.
 *
 * Two things this deliberately does NOT do:
 * - no coloured left bar on rows. Every row used to carry the same red edge,
 *   which meant red carried no information at all. Red is now reserved for
 *   problems and destructive actions.
 * - no badge unless it says something. Under capacity → amber "{n} seats"
 *   (or "Empty" at zero); at capacity → green "Full"; otherwise nothing.
 *
 * Rows sit in a 1px-gap group so the separators are the group background
 * showing through, rather than per-row borders that would double up.
 */
import type { DashboardSchedule7dBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Eyebrow, FillBar, FillCount, StatusBadge } from "./primitives";
import { weekdayShort } from "@levelup/config";

type Row = DashboardSchedule7dBlock["data"]["items"][number];

/** The badge is the whole point of the row's right edge — so it only shows
 * when it changes what the coach would do. */
function badgeFor(row: Row, t: (k: string, o?: Record<string, unknown>) => string) {
  if (!row.capacity) return null;
  if (row.filled >= row.capacity) {
    return <StatusBadge tone="done">{t("dashboard.schedule.full")}</StatusBadge>;
  }
  if (row.filled === 0) {
    return <StatusBadge tone="attention">{t("dashboard.schedule.empty")}</StatusBadge>;
  }
  return (
    <StatusBadge tone="attention">
      {t("dashboard.schedule.seats", { count: row.capacity - row.filled })}
    </StatusBadge>
  );
}

export function Schedule7Days({ block }: { block: DashboardSchedule7dBlock }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { items, totalCount, calendarHref } = block.data;

  return (
    <section className="flex flex-col gap-2.5" data-testid="dashboard-schedule">
      <div className="flex items-center justify-between px-1">
        <Eyebrow>
          {t("dashboard.schedule.eyebrow", { count: totalCount })}
        </Eyebrow>
        <Link
          to={calendarHref}
          className="text-[13px] font-semibold text-primary hover:underline"
        >
          {t("dashboard.schedule.calendar")}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-muted px-4 py-5 text-center text-sm text-muted-foreground">
          {t("dashboard.schedule.none")}
        </div>
      ) : (
        <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {items.map((row) => {
            const short = row.capacity > 0 && row.filled < row.capacity;
            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(row.href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(row.href);
                  }
                }}
                className="flex cursor-pointer items-center gap-3.5 bg-card px-4 py-3.5 text-left transition-colors hover:bg-accent/40 lg:gap-4"
              >
                {/* Date column — fixed width so a week scans vertically. */}
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-[11px] text-muted-foreground">
                    {weekdayShort(row.date, i18n.language)}
                  </span>
                  <span className="text-[15px] font-bold tabular-nums">{row.dayOfMonth}</span>
                </div>

                {/* Mobile: name over time + bar + count. Desktop: fixed columns. */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
                  <span className="truncate text-[15px] font-bold lg:order-2 lg:flex-1">
                    {row.title}
                  </span>
                  <div className="flex items-center gap-2 lg:order-1 lg:w-14 lg:shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {row.timeLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 lg:order-3 lg:w-24 lg:shrink-0">
                    <FillBar filled={row.filled} capacity={row.capacity} />
                    <FillCount filled={row.filled} capacity={row.capacity} />
                  </div>
                </div>

                {/* Fixed-width so rows with and without a badge stay aligned. */}
                <div className="flex w-auto shrink-0 justify-end lg:w-20">
                  {badgeFor(row, t)}
                </div>

                {/* Desktop-only action column. Rows that don't need it render an
                    empty cell so the grid never shifts. */}
                <div className="hidden w-20 shrink-0 justify-end lg:flex">
                  {short && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(row.href);
                      }}
                    >
                      {t("dashboard.schedule.invite")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
