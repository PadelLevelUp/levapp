import { Ionicons } from "@expo/vector-icons";
import { lightTheme, nativeCalendarSurfaces } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format, isSameDay, isToday } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { dayDotColors } from "./day-dots";

const SURFACES = nativeCalendarSurfaces("light");

/**
 * The Dia week strip — calendar.mobile-views rule 10. React Native port of
 * apps/web's `DayStrip`: chevrons, seven date columns, a dot row per day.
 *
 * Dots, not chips: the old strip stacked title chips per column that scrolled
 * internally (calendar.view rule 14, now superseded). The dots say "this day
 * has things" in the class's colour; the selected day's cards say the rest.
 * The testIDs the Maestro `goto-seeded-monday` subflow drives —
 * `calendar-next-week`, `calendar-day-{yyyy-MM-dd}` — are unchanged.
 */
export function DayStrip({
  weekDays,
  selectedDay,
  onSelectDay,
  onPrev,
  onNext,
  eventsByDay,
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Events keyed by `yyyy-MM-dd`, already sorted by start time. */
  eventsByDay: Record<string, CalendarEvent[]>;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();

  return (
    <View className="flex-row items-center gap-2.5 border-b border-border bg-card px-4 py-3">
      <Pressable
        testID="calendar-prev-week"
        accessibilityLabel={t("calendar.toolbar.previousWeek")}
        role="button"
        onPress={onPrev}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
      >
        <Ionicons name="chevron-back" size={20} color={lightTheme.mutedForeground} />
      </Pressable>

      <View className="flex-1 flex-row justify-between">
        {weekDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const events = eventsByDay[key] ?? [];
          const selected = isSameDay(day, selectedDay);
          const today = isToday(day);
          const abbr = format(day, "EEE", { locale }).replace(/\.$/, "").toUpperCase();
          const dots = dayDotColors(events, SURFACES);

          return (
            <Pressable
              key={key}
              testID={`calendar-day-${key}`}
              role="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${format(day, "EEEE d MMMM", { locale })}, ${t(
                "calendar.mobile.dayDots",
                { count: events.length }
              )}`}
              onPress={() => onSelectDay(day)}
              className={cn(
                "items-center gap-1 rounded-[10px] px-1 py-0.5",
                selected && "bg-secondary"
              )}
            >
              <Text
                className={cn(
                  "text-[8.5px] font-sans-bold tracking-wider",
                  selected ? "text-primary" : "text-muted-foreground"
                )}
              >
                {abbr}
              </Text>
              <View
                className={cn(
                  "h-7 w-7 items-center justify-center rounded-full",
                  selected && "bg-sidebar",
                  !selected && today && "border-2 border-primary"
                )}
              >
                <Text
                  className={cn(
                    "text-[13px] font-sans-bold",
                    selected
                      ? "text-sidebar-foreground"
                      : today
                        ? "text-primary"
                        : "text-foreground"
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
          );
        })}
      </View>

      <Pressable
        testID="calendar-next-week"
        accessibilityLabel={t("calendar.toolbar.nextWeek")}
        role="button"
        onPress={onNext}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full active:bg-muted"
      >
        <Ionicons name="chevron-forward" size={20} color={lightTheme.mutedForeground} />
      </Pressable>
    </View>
  );
}
