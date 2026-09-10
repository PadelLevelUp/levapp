import { useMemo } from "react";
import { format, isToday, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { findNextEventId } from "@levelup/config";
import type { CalendarViewMode } from "@levelup/hooks";
import type { CalendarEvent, CoachLevel } from "@/types";
import { DayHeader } from "./DayHeader";
import { DayStrip } from "./DayStrip";
import { FAB_CLEARANCE_PX } from "./layout";
import { MobileEventCard } from "./MobileEventCard";
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
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  // Same gate as the desktop grid: the next class shows whenever the visible
  // range contains today. Requiring the SELECTED DAY to be today meant tapping
  // the day the next class actually falls on showed nothing.
  const nextEventId = useMemo(
    () => (visibleDays.some((d) => isToday(d)) ? findNextEventId(visibleEvents) : undefined),
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
    <div className="flex h-full flex-col">
      {control}

      <DayStrip
        weekDays={weekDays}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        onPrev={onPrevWeek}
        onNext={onNextWeek}
        eventsByDay={eventsByDay}
      />

      <div data-testid="calendar-day-list" className="min-h-0 flex-1 overflow-y-auto">
        <DayHeader day={selectedDay} count={dayEvents.length} />
        {/* Rule 18: bottom padding taller than the floating add buttons, so
            the last card can always be scrolled clear of them. */}
        <div className="flex flex-col gap-3 px-5 pt-3" style={{ paddingBottom: FAB_CLEARANCE_PX }}>
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
      </div>
    </div>
  );
}
