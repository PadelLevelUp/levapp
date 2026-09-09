import { useMemo } from "react";
import { format, isToday, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { findNextEventId } from "@levelup/config";
import type { CalendarViewMode } from "@levelup/hooks";
import type { CalendarEvent, CoachLevel } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DayHeader } from "./DayHeader";
import { DayStrip } from "./DayStrip";
import { MobileEventCard } from "./MobileEventCard";
import { ViewModeControl } from "./ViewModeControl";

/** Modes that have shipped. Semana arrives with PAD-247, Mês with PAD-248. */
export const ENABLED_VIEW_MODES: CalendarViewMode[] = ["day"];

function eventDayKey(event: CalendarEvent): string {
  const date = event.date;
  if (typeof date !== "string") return "";
  if (date.length >= 10 && date[4] === "-" && date[7] === "-") return date.slice(0, 10);
  try {
    return format(parseISO(date), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

/**
 * The phone calendar — calendar.mobile-views, the Dia mode (PAD-246).
 *
 * Segmented control, the week strip with dots, then the selected day spelled
 * out with its cards. The selected day and the mode live in `useCalendar` and
 * arrive as props, so this component never re-decides the reselect rule.
 */
export function MobileCalendar({
  viewMode,
  onViewModeChange,
  weekDays,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  events,
  levels = [],
  onEventClick,
}: {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** The visible week's events. */
  events: CalendarEvent[];
  levels?: CoachLevel[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();

  // One pass over the week: the strip needs every day's events in start-time
  // order for its dots, and the detail list is just one of those buckets.
  const eventsByDay = useMemo(() => {
    const byDay: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const key = eventDayKey(event);
      if (!key) continue;
      (byDay[key] ??= []).push(event);
    }
    for (const list of Object.values(byDay)) {
      list.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    }
    return byDay;
  }, [events]);

  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  // Same gate as the desktop grid: the next class shows whenever the visible
  // WEEK contains today. Requiring the SELECTED DAY to be today meant tapping
  // the day the next class actually falls on showed nothing.
  const nextEventId = useMemo(
    () => (weekDays.some((d) => isToday(d)) ? findNextEventId(events) : undefined),
    [events, weekDays]
  );

  return (
    <div className="flex h-full flex-col">
      <ViewModeControl
        value={viewMode}
        onChange={onViewModeChange}
        enabled={ENABLED_VIEW_MODES}
      />

      <DayStrip
        weekDays={weekDays}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        eventsByDay={eventsByDay}
      />

      <ScrollArea className="flex-1">
        <DayHeader day={selectedDay} count={dayEvents.length} />
        <div className="flex flex-col gap-3 px-5 pb-32 pt-3">
          {dayEvents.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {t("calendar.mobile.noClassesScheduled")}
            </p>
          ) : (
            dayEvents.map((event) => (
              <MobileEventCard
                key={String(event.id)}
                event={event}
                isNext={event.id === nextEventId}
                levelCode={
                  event.levelId !== undefined
                    ? levelCodeById.get(String(event.levelId))
                    : undefined
                }
                onClick={onEventClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
