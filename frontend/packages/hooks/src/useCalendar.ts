import { useState, useMemo, useCallback, useEffect } from "react";
import {
  addWeeks,
  subWeeks,
  startOfWeek,
  addDays,
  format,
  parseISO,
  isWithinInterval,
  isSameDay,
  isToday,
} from "date-fns";
import { formatWeekRangeLabel, resolveDateLocale } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";

/** The phone calendar's three modes (calendar.mobile-views rule 1). */
export type CalendarViewMode = "day" | "week" | "month";

interface UseCalendarOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Date the calendar opens on. Only read on the first render — pass it when the
   * consumer already knows which week to show (e.g. a `?date=` deep link), so the
   * first events fetch is made for the right week instead of the current one.
   * It is also the initially selected day.
   */
  initialDate?: Date;
  /**
   * Active UI language (`i18n.language`), used to localize `weekLabel`.
   * PAD-181: this hook is shared by both shells and must stay platform-neutral,
   * so the shell passes its language in rather than the hook importing an
   * i18next instance. Pass the value from `useTranslation()` — that is what makes
   * the label re-render when the coach switches language. Omitted/unknown falls
   * back to Portuguese (settings.language rule 4).
   */
  language?: string;
  /**
   * PAD-246: the phone view mode the calendar opens in. Persistence is the
   * shell's job (localStorage on web, SecureStore on iOS) — the hook only takes
   * the stored value and reports changes through `onViewModeChange`.
   */
  initialViewMode?: CalendarViewMode;
  onViewModeChange?: (mode: CalendarViewMode) => void;
}

/** Today when the week shows it, otherwise the week's first day (rule 2). */
function defaultSelection(weekDays: Date[]): Date {
  return weekDays.find((d) => isToday(d)) ?? weekDays[0];
}

export function useCalendar(
  allEvents: CalendarEvent[],
  options: UseCalendarOptions = {}
) {
  const {
    weekStartsOn = 1,
    initialDate,
    language,
    initialViewMode = "day",
    onViewModeChange,
  } = options;
  const [currentDate, setCurrentDate] = useState(() => initialDate ?? new Date());

  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn }),
    [currentDate, weekStartsOn]
  );

  const weekRange = useMemo(
    () => ({
      start: weekStart,
      end: addDays(weekStart, 6),
    }),
    [weekStart]
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // PAD-246: ONE selected day for every mode, owned here so web and iOS stop
  // each keeping their own copy of the reselect rule. Paging to a range that
  // no longer contains the selection picks today if visible, else the first
  // day — the behaviour both shells already had, now in one place.
  const [selectedDay, setSelectedDay] = useState<Date>(
    () => initialDate ?? defaultSelection(weekDays)
  );
  useEffect(() => {
    if (weekDays.some((d) => isSameDay(d, selectedDay))) return;
    setSelectedDay(defaultSelection(weekDays));
  }, [weekDays, selectedDay]);

  const selectDay = useCallback((date: Date) => {
    setSelectedDay(date);
  }, []);

  const [viewMode, setViewModeState] = useState<CalendarViewMode>(initialViewMode);
  const setViewMode = useCallback(
    (mode: CalendarViewMode) => {
      setViewModeState(mode);
      onViewModeChange?.(mode);
    },
    [onViewModeChange]
  );

  const events = useMemo(() => {
    return allEvents.filter((event) => {
      const eventDate = parseISO(event.date);
      return isWithinInterval(eventDate, weekRange);
    });
  }, [allEvents, weekRange]);

  const getEventsForDay = useCallback(
    (date: Date): CalendarEvent[] => {
      const dateStr = format(date, "yyyy-MM-dd");
      return events.filter((event) => event.date === dateStr);
    },
    [events]
  );

  const navigateWeek = useCallback((direction: "prev" | "next") => {
    setCurrentDate((prev) =>
      direction === "next" ? addWeeks(prev, 1) : subWeeks(prev, 1)
    );
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDay(now);
  }, []);

  // Compact week-range label (e.g. "6–12 Jul" or "31 Aug–6 Sep"). Kept short so
  // it stays on a single line even on narrow (375px) mobile headers.
  //
  // PAD-181: derived from `language` on every render — never frozen into state —
  // so a language switch in Settings re-renders it. The formatting itself lives
  // in `@levelup/config` so web, iOS and this hook share one implementation.
  const weekLabel = useMemo(
    () => formatWeekRangeLabel(weekStart, resolveDateLocale(language)),
    [weekStart, language]
  );

  return {
    currentDate,
    weekStart,
    weekDays,
    weekRange,
    weekLabel,
    events,
    getEventsForDay,
    navigateWeek,
    goToToday,
    setCurrentDate,
    selectedDay,
    selectDay,
    viewMode,
    setViewMode,
  };
}
