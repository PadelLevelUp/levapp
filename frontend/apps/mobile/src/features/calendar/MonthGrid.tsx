import { isClubToday, isInMonth, MONTH_WEEKDAY_HEADER_HEIGHT, nativeCalendarSurfaces } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format, isSameDay } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { dayDotColors } from "./day-dots";

const SURFACES = nativeCalendarSurfaces("light");

/** The grid's weeks, seven days each (monthDays is whole Monday-start weeks). */
export function monthWeeks(monthDays: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < monthDays.length; i += 7) weeks.push(monthDays.slice(i, i + 7));
  return weeks;
}

/**
 * The Mês grid — calendar.mobile-views rule 16. React Native port of
 * apps/web's `MonthGrid`: a weekday header row, then Monday-start cells for
 * every week touching the month. In-month cells carry the Dia strip's circle
 * states and dot row; the neighbouring months' days render at 32% opacity and
 * cannot be pressed.
 *
 * PAD-437 (B-201): one row per week, seven `flex-1` cells each. The cells used to wrap in a
 * single flex-wrap row at width `${100 / 7}%`; seven of those rounded past the row's width, so
 * Sunday wrapped onto the next line and every later date sat one weekday off.
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
  eventsByDay: Record<string, CalendarEvent[]>;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  return (
    <View testID="calendar-month-grid" className="bg-background px-2.5 pb-3">
      {/* Fixed height, no font scaling: the sheet's maximum (rule 17) is one grid row
          below this grid's top and must always leave the header visible. */}
      <View
        className="flex-row overflow-hidden pt-2.5"
        style={{ height: MONTH_WEEKDAY_HEADER_HEIGHT }}
        accessibilityElementsHidden
      >
        {monthDays.slice(0, 7).map((d) => (
          <Text
            key={d.toISOString()}
            allowFontScaling={false}
            className="flex-1 pb-2 text-center text-[9.5px] font-sans-bold tracking-wider text-muted-foreground"
          >
            {format(d, "EEE", { locale }).replace(/\.$/, "").toUpperCase()}
          </Text>
        ))}
      </View>
      {monthWeeks(monthDays).map((week) => (
      <View key={format(week[0], "yyyy-MM-dd")} testID="calendar-month-week" className="flex-row">
        {week.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isInMonth(day, monthStart);
          const selected = inMonth && isSameDay(day, selectedDay);
          const today = inMonth && isClubToday(day);
          const events = inMonth ? eventsByDay[key] ?? [] : [];
          const dots = dayDotColors(events, SURFACES);
          return (
            <View key={key} className="flex-1" style={{ padding: 1 }}>
              <Pressable
                testID={`calendar-month-cell-${key}`}
                role="button"
                disabled={!inMonth}
                accessibilityState={{ selected, disabled: !inMonth }}
                accessibilityLabel={`${format(day, "EEEE d MMMM", { locale })}, ${t(
                  "calendar.mobile.dayDots",
                  { count: events.length }
                )}`}
                onPress={() => onSelectDay(day)}
                style={{ opacity: inMonth ? 1 : 0.32 }}
                className={cn(
                  "items-center gap-1 rounded-[10px] pb-2 pt-1.5",
                  selected && "bg-secondary"
                )}
              >
                <View
                  className={cn(
                    "h-[26px] w-[26px] items-center justify-center rounded-full",
                    selected && "bg-sidebar",
                    !selected && today && "border-2 border-primary"
                  )}
                >
                  <Text
                    className={cn(
                      "text-[12.5px] font-sans-bold",
                      selected ? "text-sidebar-foreground" : today ? "text-primary" : "text-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </Text>
                </View>
                <View className="h-[5px] flex-row gap-0.5">
                  {dots.map((color, i) => (
                    <View
                      key={`${key}-${i}`}
                      testID="day-fill-dot"
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
      ))}
    </View>
  );
}
