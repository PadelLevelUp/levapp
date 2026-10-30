import { cardSurfaceNative, GRID_ROW_HEIGHT, layoutDayColumn, lightTheme, nativeCalendarSurfaces, resolveCardVariant, showsEnrolledMark, type HourRange } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format, isSameDay } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { Text } from "@/components/ui/text";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { GUTTER_PT } from "./WeekHeaderRow";
import { useCalendarViewer } from "./viewer-context";

/** Points per hour on the phone grid. */
/** B-543 (calendar.mobile-views rule 13): a phone day column fits two classes side by side. */
export const PHONE_MAX_COLUMNS = 2;

export const ROW_HEIGHT = GRID_ROW_HEIGHT;

const SURFACES = nativeCalendarSurfaces("light");

/** PAD-592: a dev-only render counter the drag measurement reads from the Metro log. */
function countGridRender(): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.log("[render] timegrid");
}

/**
 * The Semana time grid — calendar.mobile-views rules 13 and 14. React Native
 * port of apps/web's `TimeGrid`, on the same shared geometry
 * (`calendar-grid.ts`): hour labels on both gutters, seven columns with hour
 * rules, blocks positioned by minutes and sharing a column when they overlap.
 * A tap on a column's empty area selects the day; a tap on a block opens it.
 */
function TimeGridImpl({
  weekDays,
  selectedDay,
  onSelectDay,
  eventsByDay,
  hourRange,
  nextEventId,
  onEventPress,
  bottomInset,
  rowHeight = ROW_HEIGHT,
}: {
  weekDays: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  eventsByDay: Record<string, CalendarEvent[]>;
  hourRange: HourRange;
  nextEventId?: string;
  onEventPress?: (event: CalendarEvent) => void;
  /**
   * PAD-790 (B-710, rule 13): the padding after the last hour row, so it can be scrolled above the
   * sheet floating over the grid. A shared value, so a committed sheet drag resizes the spacer
   * without re-rendering this memoised grid (PAD-592).
   */
  bottomInset?: SharedValue<number>;
  rowHeight?: number;
}) {
  countGridRender();
  const { t } = useTranslation();
  const viewer = useCalendarViewer();
  const locale = useDateLocale();
  const { startHour, endHour } = hourRange;
  const hours = React.useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour]
  );
  const innerHeight = (endHour - startHour) * rowHeight + 1;
  const endSpace = useAnimatedStyle(() => ({ height: bottomInset?.value ?? 0 }));

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
      showsVerticalScrollIndicator
    >
      <View style={{ height: innerHeight }} className="flex-row">
        {labels("left")}
        <View className="flex-1 flex-row">
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const selected = isSameDay(day, selectedDay);
            // B-543 (rule 13): lanes packed; past two at once, one "+N" marker per cluster.
            const { blocks: laid, overflow } = layoutDayColumn(eventsByDay[key] ?? [], {
              startHour,
              rowHeight,
              maxColumns: PHONE_MAX_COLUMNS,
            });
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
                    viewer,
                  });
                  const surface = cardSurfaceNative(event.color, variant, SURFACES, viewer);
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
                        borderStyle: surface.borderStyle,
                        borderColor: surface.borderColor,
                      }}
                      className="overflow-hidden rounded-md px-1 py-0.5 active:opacity-90"
                    >
                      <Text
                        numberOfLines={2}
                        className="text-[8.5px] font-sans-bold leading-[10px]"
                        style={{ color: isBlock ? SURFACES.mutedForeground : surface.color }}
                      >
                        {showsEnrolledMark(event, variant, viewer) ? (
                          <Text
                            testID="calendar-enrolled-mark"
                            accessibilityLabel={t("calendar.eventCard.enrolled")}
                            className="text-[8.5px] font-sans-bold"
                            style={{ color: surface.color }}
                          >
                            {"✓ "}
                          </Text>
                        ) : null}
                        {event.title || t("calendar.eventCard.fallbackTitle")}
                      </Text>
                    </Pressable>
                  );
                })}
                {overflow.map((marker) => (
                  <Pressable
                    key={`overflow-${marker.key}`}
                    testID="calendar-overflow"
                    role="button"
                    accessibilityLabel={t("calendar.overflow.aria", { count: marker.events.length })}
                    onPress={() => onSelectDay(day)}
                    style={{
                      position: "absolute",
                      top: marker.top,
                      height: marker.height,
                      left: `${(marker.column * 100) / marker.columns}%`,
                      width: `${100 / marker.columns}%`,
                      marginLeft: 1,
                      marginRight: 1,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: SURFACES.mutedForeground,
                      backgroundColor: lightTheme.muted,
                    }}
                    className="items-center overflow-hidden rounded-md pt-0.5"
                  >
                    <Text className="text-[9px] font-sans-bold" style={{ color: SURFACES.foreground }}>
                      {t("calendar.overflow.label", { count: marker.events.length })}
                    </Text>
                  </Pressable>
                ))}
              </Pressable>
            );
          })}
        </View>
        {labels("right")}
      </View>
      {bottomInset ? <Animated.View testID="calendar-grid-end-space" pointerEvents="none" style={endSpace} /> : null}
    </ScrollView>
  );
}

/**
 * PAD-592: memoised — the sheet's drag no longer re-renders the container per frame (DaySheet),
 * and when the container does re-render, the grid skips unless its week, events, range or
 * callbacks changed.
 */
export const TimeGrid = React.memo(TimeGridImpl);
