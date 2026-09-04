import { useState, useMemo, useCallback } from "react";
import {
  addWeeks,
  subWeeks,
  startOfWeek,
  addDays,
  format,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { formatWeekRangeLabel, resolveDateLocale } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";

interface UseCalendarOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Date the calendar opens on. Only read on the first render — pass it when the
   * consumer already knows which week to show (e.g. a `?date=` deep link), so the
   * first events fetch is made for the right week instead of the current one.
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
}

export function useCalendar(
  allEvents: CalendarEvent[],
  options: UseCalendarOptions = {}
) {
  const { weekStartsOn = 1, initialDate, language } = options;
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
    setCurrentDate(new Date());
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
  };
}
