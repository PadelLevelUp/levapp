import {
  cardSurfaceNative,
  layoutDayEvents,
  lightTheme,
  nativeCalendarSurfaces,
  resolveCardVariant,
  type HourRange,
} from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format, isSameDay } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { GUTTER_PT } from "./WeekHeaderRow";

/** Points per hour on the phone grid. */
export const ROW_HEIGHT = 44;

const SURFACES = nativeCalendarSurfaces("light");

/**
 * The Semana time grid — calendar.mobile-views rules 13 and 14. React Native
 * port of apps/web's `TimeGrid`, on the same shared geometry
 * (`calendar-grid.ts`): hour labels on both gutters, seven columns with hour
 * rules, blocks positioned by minutes and sharing a column when they overlap.
 * A tap on a column's empty area selects the day; a tap on a block opens it.
 */
export function TimeGrid({
  weekDays,
  selectedDay,
  onSelectDay,
  eventsByDay,
  hourRange,
  nextEventId,
  onEventPress,
  rowHeight = ROW_HEIGHT,
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  eventsByDay: Record<string, CalendarEvent[]>;
  hourRange: HourRange;
  nextEventId?: string;
  onEventPress?: (event: CalendarEvent) => void;
  rowHeight?: number;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { startHour, endHour } = hourRange;
  const hours = React.useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const innerHeight = (endHour - startHour) * rowHeight + 1;

  const labels = (side: "left" | "right") => (
    <View style={{ width: GUTTER_PT }}>
      {hours.map((h) => (
        <Text
          key={h}
          testID={side === "left" ? "calendar-hour-label" : undefined}
          accessibilityElementsHidden={side === "right"}
          style={{
            position: "absolute",
            top: (h - startHour) * rowHeight + 2,
            ...(side === "left" ? { right: 4 } : { left: 4 }),
          }}
          className="text-[8px] font-sans-semibold text-muted-foreground"
        >
          {String(h).padStart(2, "0")}
        </Text>
      ))}
    </View>
  );

  return (
    <ScrollView
      testID="calendar-time-grid"
      className="flex-1 bg-background"
      contentContainerStyle={{ height: innerHeight }}
      showsVerticalScrollIndicator
    >
      <View className="flex-1 flex-row">
        {labels("left")}
        <View className="flex-1 flex-row">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const selected = isSameDay(day, selectedDay);
            const laid = layoutDayEvents(eventsByDay[key] ?? [], { startHour, rowHeight });
            return (
              <Pressable
                key={key}
                testID={`calendar-grid-column-${key}`}
                role="button"
                accessibilityState={{ selected }}
                accessibilityLabel={format(day, "EEEE d MMMM", { locale })}
                onPress={() => onSelectDay(day)}
                className={cn("min-w-0 flex-1 border-l border-border", selected && "bg-secondary")}
              >
                {hours.map((h) => (
                  <View
                    key={h}
                    pointerEvents="none"
                    style={{ position: "absolute", left: 0, right: 0, top: (h - startHour) * rowHeight }}
                    className="border-t border-border"
                  />
                ))}
                {laid.map(({ event, top, height, column, columns }) => {
                  const { variant } = resolveCardVariant(event, {
                    isNext: event.id === nextEventId,
                  });
                  const surface = cardSurfaceNative(event.color, variant, SURFACES);
                  const width = 100 / columns;
                  const isBlock = variant === "block";
                  return (
                    <Pressable
                      key={String(event.id)}
                      testID={`calendar-grid-block-${event.id}`}
                      role="button"
                      accessibilityLabel={event.title || t("calendar.eventCard.fallbackTitle")}
                      accessibilityHint={`${event.startTime} – ${event.endTime}`}
                      onPress={() => onEventPress?.(event)}
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: `${column * width}%`,
                        width: `${width}%`,
                        marginLeft: 1,
                        marginRight: 1,
                        backgroundColor: isBlock ? lightTheme.muted : surface.backgroundColor,
                        borderWidth: surface.borderWidth,
                        borderColor: surface.borderColor,
                      }}
                      className="overflow-hidden rounded-md px-1 py-0.5 active:opacity-90"
                    >
                      <Text
                        numberOfLines={2}
                        className="text-[8.5px] font-sans-bold leading-[10px]"
                        style={{ color: isBlock ? SURFACES.mutedForeground : surface.color }}
                      >
                        {event.title || t("calendar.eventCard.fallbackTitle")}
                      </Text>
                    </Pressable>
                  );
                })}
              </Pressable>
            );
          })}
        </View>
        {labels("right")}
      </View>
    </ScrollView>
  );
}
