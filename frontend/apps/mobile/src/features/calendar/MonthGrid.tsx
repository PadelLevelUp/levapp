import { isClubToday, isInMonth, nativeCalendarSurfaces } from "@levelup/config";
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
const CELL_WIDTH = `${100 / 7}%` as const;

/**
 * The Mês grid — calendar.mobile-views rule 16. React Native port of
 * apps/web's `MonthGrid`: a weekday header row, then Monday-start cells for
 * every week touching the month. In-month cells carry the Dia strip's circle
 * states and dot row; the neighbouring months' days render at 32% opacity and
 * cannot be pressed.
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
      <View className="flex-row pt-2.5" accessibilityElementsHidden>
        {monthDays.slice(0, 7).map((d) => (
          <Text
            key={d.toISOString()}
            className="flex-1 pb-2 text-center text-[9.5px] font-sans-bold tracking-wider text-muted-foreground"
          >
            {format(d, "EEE", { locale }).replace(/\.$/, "").toUpperCase()}
          </Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {monthDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isInMonth(day, monthStart);
          const selected = inMonth && isSameDay(day, selectedDay);
          const today = inMonth && isClubToday(day);
          const events = inMonth ? eventsByDay[key] ?? [] : [];
          const dots = dayDotColors(events, SURFACES);
          return (
            <View key={key} style={{ width: CELL_WIDTH, padding: 1 }}>
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
    </View>
  );
}
