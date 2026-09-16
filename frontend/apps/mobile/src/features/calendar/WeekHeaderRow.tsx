import { format, isSameDay } from "date-fns";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { isClubToday } from "@levelup/config";

/** Width of the hour-label gutters the columns must line up with (rule 12). */
export const GUTTER_PT = 26;

/**
 * The Semana day header row — calendar.mobile-views rule 12. React Native
 * port of apps/web's `WeekHeaderRow`: seven columns over the grid's gutters,
 * each an abbreviation and a 26pt date circle with the Dia strip's states.
 * Keeps `calendar-day-<key>` for the shared Maestro subflow.
 */
export function WeekHeaderRow({
  weekDays,
  selectedDay,
  onSelectDay,
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
}) {
  const locale = useDateLocale();
  return (
    <View className="flex-row border-b border-border bg-card">
      <View style={{ width: GUTTER_PT }} />
      {weekDays.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const selected = isSameDay(day, selectedDay);
        const today = isClubToday(day);
        return (
          <Pressable
            key={key}
            testID={`calendar-day-${key}`}
            role="button"
            accessibilityState={{ selected }}
            accessibilityLabel={format(day, "EEEE d MMMM", { locale })}
            onPress={() => onSelectDay(day)}
            className={cn("min-w-0 flex-1 items-center gap-1 px-0.5 pb-2 pt-2.5", selected && "bg-secondary")}
          >
            <Text
              className={cn(
                "text-[9.5px] font-sans-bold tracking-wider",
                selected ? "text-primary" : "text-muted-foreground"
              )}
            >
              {format(day, "EEE", { locale }).replace(/\.$/, "").toUpperCase()}
            </Text>
            <View
              className={cn(
                "h-[26px] w-[26px] items-center justify-center rounded-full",
                selected && "bg-sidebar",
                !selected && today && "border-2 border-primary"
              )}
            >
              <Text
                className={cn(
                  "text-[13px] font-sans-bold",
                  selected ? "text-sidebar-foreground" : today ? "text-primary" : "text-foreground"
                )}
              >
                {format(day, "d")}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <View style={{ width: GUTTER_PT }} />
    </View>
  );
}
