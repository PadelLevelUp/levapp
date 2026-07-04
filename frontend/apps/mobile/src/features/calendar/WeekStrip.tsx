import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { format, isSameDay, isToday } from "date-fns";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type WeekStripProps = {
  weekDays: Date[];
  weekLabel: string;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** Count of events per yyyy-MM-dd, used to render a dot under busy days. */
  eventCountByDay?: Record<string, number>;
};

/** Mon–Sun strip with prev/next week navigation (mobile analogue of the web
 * calendar toolbar + header). */
export function WeekStrip({
  weekDays,
  weekLabel,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  eventCountByDay = {},
}: WeekStripProps) {
  return (
    <View className="border-b border-border bg-card px-2 pb-2 pt-1">
      <View className="flex-row items-center justify-between">
        <Pressable
          testID="calendar-prev-week"
          accessibilityLabel="Previous week"
          role="button"
          onPress={onPrevWeek}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={20} color={lightTheme.foreground} />
        </Pressable>
        <Text className="text-sm font-semibold">{weekLabel}</Text>
        <Pressable
          testID="calendar-next-week"
          accessibilityLabel="Next week"
          role="button"
          onPress={onNextWeek}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={lightTheme.foreground}
          />
        </Pressable>
      </View>

      <View className="mt-1 flex-row">
        {weekDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const isSelected = isSameDay(day, selectedDay);
          const dayIsToday = isToday(day);
          const hasEvents = (eventCountByDay[dayKey] ?? 0) > 0;

          return (
            <Pressable
              key={dayKey}
              testID={`calendar-day-${dayKey}`}
              accessibilityLabel={format(day, "EEEE, MMMM d")}
              role="button"
              onPress={() => onSelectDay(day)}
              className={cn(
                "mx-0.5 flex-1 items-center rounded-lg py-1.5",
                isSelected ? "bg-primary" : "active:bg-accent"
              )}
            >
              <Text
                className={cn(
                  "text-[10px] uppercase",
                  isSelected ? "text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {format(day, "EEE")}
              </Text>
              <Text
                className={cn(
                  "text-base font-semibold",
                  isSelected
                    ? "text-primary-foreground"
                    : dayIsToday
                      ? "text-primary"
                      : "text-foreground"
                )}
              >
                {format(day, "d")}
              </Text>
              <View
                className={cn(
                  "mt-0.5 h-1.5 w-1.5 rounded-full",
                  hasEvents
                    ? isSelected
                      ? "bg-primary-foreground"
                      : "bg-primary"
                    : "bg-transparent"
                )}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
