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
import { enGB, pt } from "date-fns/locale";
import type { Locale } from "date-fns";
import type { CalendarEvent } from "@levelup/types";

export type CalendarLocale = "en" | "pt";

const WEEK_LABEL_LOCALES: Record<CalendarLocale, Locale> = {
  en: enGB,
  pt,
};

/**
 * Pure formatting helper for the week-range label, extracted so it can be
 * unit tested without a React renderer. Given the first day of the week (a
 * Monday by default) and a locale, produces a human-readable range such as
 * "6 - 12 July 2026" (en) or "6 - 12 de julho 2026" (pt). Falls back to a
 * "d MMM - d MMM yyyy" format when the range spans two different months.
 */
export function formatWeekLabel(
  weekStart: Date,
  locale: CalendarLocale = "en"
): string {
  const end = addDays(weekStart, 6);
  const dateFnsLocale = WEEK_LABEL_LOCALES[locale];

  const startMonth = format(weekStart, "MMMM", { locale: dateFnsLocale });
  const endMonth = format(end, "MMMM yyyy", { locale: dateFnsLocale });

  if (startMonth === format(end, "MMMM", { locale: dateFnsLocale })) {
    const connector = locale === "pt" ? " de " : " ";
    return `${format(weekStart, "d")} - ${format(end, "d")}${connector}${endMonth}`;
  }

  return `${format(weekStart, "d MMM", { locale: dateFnsLocale })} - ${format(
    end,
    "d MMM yyyy",
    { locale: dateFnsLocale }
  )}`;
}

interface UseCalendarOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: CalendarLocale;
}

export function useCalendar(
  allEvents: CalendarEvent[],
  options: UseCalendarOptions = {}
) {
  const { weekStartsOn = 1, locale = "en" } = options;
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

  const weekLabel = useMemo(
    () => formatWeekLabel(weekStart, locale),
    [weekStart, locale]
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
