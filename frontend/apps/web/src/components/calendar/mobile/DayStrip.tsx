import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, isSameDay, isToday } from "date-fns";
import { useTranslation } from "react-i18next";
import { cardSurfaceWeb, resolveCardVariant } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/dateLocale";

/** Up to three dots per day, in start order — calendar.mobile-views rule 10. */
export const MAX_DAY_DOTS = 3;

/**
 * The date circle's states (rule 10), shared with the Semana header row:
 * selected → navy on white; today unselected → primary ring; else plain.
 */
export function dateCircleClass(selected: boolean, today: boolean): string {
  return cn(
    "flex items-center justify-center rounded-full font-bold tabular-nums",
    selected && "bg-sidebar text-sidebar-foreground",
    !selected && today && "text-primary ring-2 ring-inset ring-primary",
    !selected && !today && "text-foreground"
  );
}

/** The weekday abbreviation's colour (rule 10). */
export function dayAbbrClass(selected: boolean): string {
  return cn(
    "font-bold uppercase tracking-wider",
    selected ? "text-primary" : "text-muted-foreground"
  );
}

/** A day dot's colour (rule 10) — shared with the Mês grid cells. */
export function dotColor(event: CalendarEvent, now: Date): string {
  const { variant } = resolveCardVariant(event, { now });
  if (variant === "block") return "hsl(var(--muted-foreground))";
  return cardSurfaceWeb(event.color, variant).backgroundColor ?? "hsl(var(--primary))";
}

/**
 * The Dia week strip: chevrons, seven date columns, a dot row per day.
 *
 * Dots, not chips. The old strip stacked title chips per column, which at
 * 9px said nothing a coach could act on; the dots say "this day has things"
 * and carry the class colour, and the selected day's cards say the rest.
 * The dots keep `data-testid="day-fill-dot"` + `data-event-title` because
 * `mobile-weekly-order.spec.ts` asserts the ordering on them.
 */
export function DayStrip({
  weekDays,
  selectedDay,
  onSelectDay,
  onPrev,
  onNext,
  eventsByDay,
  now = new Date(),
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Events keyed by `yyyy-MM-dd`, already sorted by start time. */
  eventsByDay: Record<string, CalendarEvent[]>;
  now?: Date;
}) {
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocale(i18n.language);

  return (
    <div className="flex items-center gap-2.5 border-b border-border bg-card px-4 py-3">
      <button
        type="button"
        data-testid="calendar-prev-week"
        aria-label={t("calendar.toolbar.previousWeek")}
        onClick={onPrev}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex flex-1 justify-between">
        {weekDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDay[key] ?? [];
          const selected = isSameDay(day, selectedDay);
          const today = isToday(day);
          const abbr = format(day, "EEE", { locale }).replace(/\.$/, "");

          return (
            <button
              key={key}
              type="button"
              data-testid={`calendar-day-${key}`}
              aria-pressed={selected}
              // Reads as "Wed 10 September" — the abbreviation first, which is
              // also what `class-date-prepopulate.spec.ts` selects the day by.
              aria-label={format(day, "EEE d MMMM", { locale })}
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[10px] px-1 py-0.5 transition-colors",
                selected ? "bg-secondary" : "hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "text-[8.5px] font-bold uppercase tracking-wider",
                  selected ? "text-primary" : "text-muted-foreground"
                )}
              >
                {abbr}
              </span>
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold tabular-nums",
                  selected && "bg-sidebar text-sidebar-foreground",
                  !selected && today && "text-primary ring-2 ring-inset ring-primary",
                  !selected && !today && "text-foreground"
                )}
              >
                {format(day, "d")}
              </span>
              <span
                className="flex h-[5px] gap-0.5"
                aria-label={t("calendar.mobile.dayDots", { count: events.length })}
              >
                {events.slice(0, MAX_DAY_DOTS).map((event) => (
                  <span
                    key={String(event.id)}
                    data-testid="day-fill-dot"
                    data-event-title={event.title}
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ backgroundColor: dotColor(event, now) }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        data-testid="calendar-next-week"
        aria-label={t("calendar.toolbar.nextWeek")}
        onClick={onNext}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
