import { useMemo } from "react";
import { format, isSameDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { cardSurfaceWeb, GRID_ROW_HEIGHT, layoutDayEvents, resolveCardVariant, type HourRange } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/dateLocale";
import { GUTTER_PX } from "./WeekHeaderRow";

/** Pixels per hour on the phone grid. */
export const ROW_HEIGHT = GRID_ROW_HEIGHT;

/**
 * The Semana time grid — calendar.mobile-views rules 13 and 14.
 *
 * Hour labels on both gutters, seven columns with hour rules, and each event
 * as an absolutely positioned block whose top and height come from its start
 * and end minutes (shared geometry in `calendar-grid.ts`, so iOS draws the
 * same picture). Overlapping events share their column side by side. Tapping
 * a column's empty area selects that day; tapping a block opens its detail.
 */
export function TimeGrid({
  weekDays,
  selectedDay,
  onSelectDay,
  eventsByDay,
  hourRange,
  nextEventId,
  onEventClick,
  rowHeight = ROW_HEIGHT,
  className,
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  /** Events keyed by `yyyy-MM-dd`, sorted by start time. */
  eventsByDay: Record<string, CalendarEvent[]>;
  hourRange: HourRange;
  nextEventId?: string;
  onEventClick?: (event: CalendarEvent) => void;
  rowHeight?: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = dateFnsLocale(i18n.language);
  const { startHour, endHour } = hourRange;
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const innerHeight = (endHour - startHour) * rowHeight + 1;

  const labels = (side: "left" | "right") => (
    <div style={{ width: GUTTER_PX }} className="relative shrink-0">
      {hours.map((h) => (
        <span
          key={h}
          data-testid={side === "left" ? "calendar-hour-label" : undefined}
          aria-hidden={side === "right"}
          style={{ top: (h - startHour) * rowHeight + 2 }}
          className={cn(
            "absolute text-[8px] font-semibold tabular-nums text-muted-foreground",
            side === "left" ? "right-1" : "left-1"
          )}
        >
          {String(h).padStart(2, "0")}
        </span>
      ))}
    </div>
  );

  return (
    <div
      data-testid="calendar-time-grid"
      data-hour-start={startHour}
      data-hour-end={endHour}
      data-row-height={rowHeight}
      className={cn("overflow-y-auto overscroll-contain bg-background", className)}
    >
      <div className="flex" style={{ height: innerHeight }}>
        {labels("left")}
        <div className="flex flex-1">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const selected = isSameDay(day, selectedDay);
            const laid = layoutDayEvents(eventsByDay[key] ?? [], { startHour, rowHeight });
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                data-testid={`calendar-grid-column-${key}`}
                data-selected={selected ? "true" : "false"}
                aria-label={format(day, "EEEE d MMMM", { locale })}
                aria-pressed={selected}
                onClick={() => onSelectDay(day)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDay(day);
                  }
                }}
                className={cn(
                  "relative min-w-0 flex-1 border-l border-border",
                  selected && "bg-secondary"
                )}
              >
                {hours.map((h) => (
                  <div
                    key={h}
                    aria-hidden
                    style={{ top: (h - startHour) * rowHeight }}
                    className="pointer-events-none absolute left-0 right-0 border-t border-border"
                  />
                ))}
                {laid.map(({ event, top, height, column, columns }) => {
                  const { variant } = resolveCardVariant(event, {
                    isNext: event.id === nextEventId,
                  });
                  const surface = cardSurfaceWeb(event.color, variant);
                  const width = 100 / columns;
                  return (
                    <button
                      key={String(event.id)}
                      type="button"
                      data-testid="calendar-grid-block"
                      data-event-id={String(event.id)}
                      data-event-state={variant}
                      data-column={column}
                      data-columns={columns}
                      aria-label={`${event.title}, ${event.startTime} – ${event.endTime}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                      style={{
                        top,
                        height,
                        left: `calc(${column * width}% + 1px)`,
                        width: `calc(${width}% - 2px)`,
                        ...surface,
                      }}
                      className={cn(
                        "absolute overflow-hidden rounded-md px-1 py-0.5 text-left text-[8.5px] font-bold leading-[1.15]",
                        variant === "block" && "bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="line-clamp-2 break-words">
                        {event.title || t("calendar.eventCard.fallbackTitle")}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {labels("right")}
      </div>
    </div>
  );
}
