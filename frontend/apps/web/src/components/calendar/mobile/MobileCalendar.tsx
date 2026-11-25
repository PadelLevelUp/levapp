import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { findNextEventId, isClubToday, nextClassIdInTodayWeek } from "@levelup/config";
import type { CalendarViewMode, useDayList } from "@levelup/hooks";
import type { CalendarEvent, CoachLevel } from "@/types";
import { DayList } from "./DayList";
import { DayStrip } from "./DayStrip";
import { MonthView } from "./MonthView";
import { ViewModeControl } from "./ViewModeControl";
import { WeekView } from "./WeekView";

/** Modes that have shipped: Dia (PAD-246), Semana (PAD-247), Mês (PAD-248). */
export const ENABLED_VIEW_MODES: CalendarViewMode[] = ["day", "week", "month"];

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

/** Events keyed by `yyyy-MM-dd`, each day in start-time order. */
function bucketByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
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
}

/**
 * The phone calendar — calendar.mobile-views: Dia (PAD-246), Semana (PAD-247)
 * and Mês (PAD-248).
 *
 * Segmented control, then the mode's own view. The selected day, the mode, the
 * week and the month all live in `useCalendar` and arrive as props, so this
 * component never re-decides the reselect rule.
 */
export function MobileCalendar({
  viewMode,
  onViewModeChange,
  weekDays,
  weekLabel,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  onToday,
  monthLabel,
  monthDays,
  monthStart,
  onPrevMonth,
  onNextMonth,
  events,
  monthEvents,
  dayList,
  levels = [],
  onEventClick,
  onAddButtonsHiddenChange,
}: {
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  weekDays: Date[];
  /** Locale week-range label from `useCalendar` (calendar.view rule 12). */
  weekLabel: string;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  /** Locale month label from `useCalendar` ("Setembro 2026"). */
  monthLabel: string;
  /** Every day of the Mês grid (whole weeks touching the month). */
  monthDays: Date[];
  monthStart: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** The visible week's events. */
  events: CalendarEvent[];
  /** Every event inside the Mês grid's range. */
  monthEvents: CalendarEvent[];
  /**
   * Dia's continuous list (rule 26): its state, and the events of every loaded day (the student's filter
   * applied). Given only while Dia shows on a phone; Semana and Mês never get it.
   */
  dayList?: { list: ReturnType<typeof useDayList>; events: CalendarEvent[] };
  levels?: CoachLevel[];
  onEventClick?: (event: CalendarEvent) => void;
  /** Rule 18: in Mês, true while the day sheet is pulled up — hide the add buttons. */
  onAddButtonsHiddenChange?: (hidden: boolean) => void;
}) {
  const { t } = useTranslation();
  const isMonth = viewMode === "month";
  const visibleEvents = isMonth ? monthEvents : events;
  const visibleDays = isMonth ? monthDays : weekDays;

  // One pass over the visible range: the strip, the grid and the month cells
  // need every day's events in start-time order, and the detail list is just
  // one of those buckets.
  const eventsByDay = useMemo(() => bucketByDay(visibleEvents), [visibleEvents]);
  // Dia (rule 26): every loaded day, not just the visible week; its next class is searched in today's week only (26e).
  const listEvents = dayList?.events;
  const listEventsByDay = useMemo(() => bucketByDay(listEvents ?? []), [listEvents]);
  const listNextEventId = useMemo(
    () => (listEvents ? nextClassIdInTodayWeek(listEvents) : undefined),
    [listEvents]
  );

  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  // Same gate as the desktop grid: the next class shows whenever the visible
  // range contains today. Requiring the SELECTED DAY to be today meant tapping
  // the day the next class actually falls on showed nothing.
  const nextEventId = useMemo(
    () => (visibleDays.some((d) => isClubToday(d)) ? findNextEventId(visibleEvents) : undefined),
    [visibleEvents, visibleDays]
  );

  const control = (
    <ViewModeControl value={viewMode} onChange={onViewModeChange} enabled={ENABLED_VIEW_MODES} />
  );

  if (isMonth) {
    return (
      <div className="flex h-full flex-col">
        {control}
        <MonthView
          monthLabel={monthLabel}
          monthDays={monthDays}
          monthStart={monthStart}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          onSheetRaisedChange={onAddButtonsHiddenChange}
          eventsByDay={eventsByDay}
          nextEventId={nextEventId}
          levels={levels}
          onEventClick={onEventClick}
        />
      </div>
    );
  }

  if (viewMode === "week") {
    return (
      <div className="flex h-full flex-col">
        {control}
        <WeekView
          weekDays={weekDays}
          weekLabel={weekLabel}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          onPrevWeek={onPrevWeek}
          onNextWeek={onNextWeek}
          onToday={onToday}
          events={events}
          eventsByDay={eventsByDay}
          nextEventId={nextEventId}
          levels={levels}
          onEventClick={onEventClick}
        />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      {control}

      <DayStrip
        weekDays={weekDays}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        eventsByDay={dayList ? listEventsByDay : eventsByDay}
      />

      {dayList && (
        <DayList
          list={dayList.list}
          eventsByDay={listEventsByDay}
          nextEventId={listNextEventId}
          levelCodeById={levelCodeById}
          onEventClick={onEventClick}
        />
      )}

      {/* Rule 26f: Hoje shows whenever the selected day is not today, and moves to it. */}
      {dayList && !isClubToday(selectedDay) && (
        <button
          type="button"
          data-testid="calendar-day-today"
          onClick={onToday}
          className="absolute bottom-24 left-1/2 z-30 h-11 -translate-x-1/2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-lg"
        >
          {t("calendar.toolbar.today")}
        </button>
      )}
    </div>
  );
}
