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
import type { CalendarEvent } from "@/types";

interface UseCalendarOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function useCalendar(
  allEvents: CalendarEvent[],
  options: UseCalendarOptions = {}
) {
  const { weekStartsOn = 1 } = options;
  const [currentDate, setCurrentDate] = useState(new Date());

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

  const weekLabel = useMemo(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);

    const startMonth = format(start, "MMMM", { locale: enGB });
    const endMonth = format(end, "MMMM yyyy", { locale: enGB });

    if (startMonth === format(end, "MMMM", { locale: enGB })) {
      return `${format(start, "d")} - ${format(end, "d")} de ${endMonth}`;
    }

    return `${format(start, "d MMM")} - ${format(end, "d MMM yyyy")}`;
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
