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
import { enGB } from "date-fns/locale";
import type { CalendarEvent } from "@levelup/types";

interface UseCalendarOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /**
   * Date the calendar opens on. Only read on the first render — pass it when the
   * consumer already knows which week to show (e.g. a `?date=` deep link), so the
   * first events fetch is made for the right week instead of the current one.
   */
  initialDate?: Date;
}

export function useCalendar(
  allEvents: CalendarEvent[],
  options: UseCalendarOptions = {}
) {
  const { weekStartsOn = 1, initialDate } = options;
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

  // Compact week-range label (e.g. "6–13 Jul" or "28 Jun–4 Jul"). Kept short so
  // it stays on a single line even on narrow (375px) mobile headers.
  const weekLabel = useMemo(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);

    const sameMonth =
      format(start, "MMM", { locale: enGB }) ===
      format(end, "MMM", { locale: enGB });

    if (sameMonth) {
      return `${format(start, "d")}–${format(end, "d MMM", { locale: enGB })}`;
    }

    return `${format(start, "d MMM", { locale: enGB })}–${format(end, "d MMM", {
      locale: enGB,
    })}`;
  }, [weekStart]);

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
