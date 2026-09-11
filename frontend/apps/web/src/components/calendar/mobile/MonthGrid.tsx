import { format, isSameDay, isToday } from "date-fns";
import { useTranslation } from "react-i18next";
import { isInMonth, MONTH_WEEKDAY_HEADER_HEIGHT } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/dateLocale";
import { MAX_DAY_DOTS, dateCircleClass, dotColor } from "./DayStrip";

/**
 * The Mês grid — calendar.mobile-views rule 16: a weekday header row, then
 * Monday-start cells for every week that touches the month. In-month cells
 * carry the Dia strip's date-circle states and dot row; the leading and
 * trailing days of the neighbouring months render at 32% opacity and cannot
 * be tapped.
 */
export function MonthGrid({
  monthDays,
  monthStart,
  selectedDay,
  onSelectDay,
  eventsByDay,
}: {
  monthDays: Date[];
  monthStart: Date;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  /** Events keyed by `yyyy-MM-dd`, sorted by start time. */
  eventsByDay: Record<string, CalendarEvent[]>;
}) {
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocale(i18n.language);
  const now = new Date();

  return (
    <div data-testid="calendar-month-grid" className="shrink-0 bg-background px-2.5 pb-3">
      <div
        className="grid grid-cols-7 items-start overflow-hidden pt-2.5"
        style={{ height: MONTH_WEEKDAY_HEADER_HEIGHT }}
        aria-hidden="true"
      >
        {monthDays.slice(0, 7).map((d) => (
          <span
            key={d.toISOString()}
            className="pb-2 text-center text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            {format(d, "EEE", { locale }).replace(/\.$/, "")}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {monthDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isInMonth(day, monthStart);
          const selected = inMonth && isSameDay(day, selectedDay);
          const today = inMonth && isToday(day);
          const events = inMonth ? eventsByDay[key] ?? [] : [];
          return (
            <button
              key={key}
              type="button"
              data-testid={`calendar-month-cell-${key}`}
              data-in-month={inMonth ? "true" : "false"}
              disabled={!inMonth}
              aria-pressed={selected}
              aria-label={`${format(day, "EEEE d MMMM", { locale })}, ${t(
                "calendar.mobile.dayDots",
                { count: events.length }
              )}`}
              onClick={() => onSelectDay(day)}
              style={{ opacity: inMonth ? 1 : 0.32 }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-[10px] pb-2 pt-1.5 transition-colors disabled:cursor-default",
                selected ? "bg-secondary" : inMonth && "hover:bg-muted/60"
              )}
            >
              <span className={cn("h-[26px] w-[26px] text-[12.5px]", dateCircleClass(selected, today))}>
                {format(day, "d")}
              </span>
              <span className="flex h-[5px] gap-0.5">
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
    </div>
  );
}
