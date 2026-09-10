import { clampSheetTop, resolveHourRange, sheetTopBounds } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format } from "date-fns";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { DaySheet, SHEET_COLLAPSED_HEIGHT } from "./DaySheet";
import { ROW_HEIGHT, TimeGrid } from "./TimeGrid";

/**
 * The time grid with the day sheet over it — calendar.mobile-views rules 3,
 * 13, 14 and 17. React Native port of apps/web's `GridWithSheet`: Semana
 * passes the week's days and events, Mês the selected day alone and that
 * day's events. Measured with `onLayout` so the sheet's travel is in points.
 */
export function GridWithSheet({
  days,
  selectedDay,
  onSelectDay,
  eventsByDay,
  rangeEvents,
  nextEventId,
  levelCodeById,
  onEventPress,
}: {
  days: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  eventsByDay: Record<string, CalendarEvent[]>;
  /** The events the visible hour range is derived from. */
  rangeEvents: CalendarEvent[];
  nextEventId?: string;
  levelCodeById: Map<string, string>;
  onEventPress?: (event: CalendarEvent) => void;
}) {
  const [containerHeight, setContainerHeight] = React.useState(0);
  const [sheetTop, setSheetTop] = React.useState<number | null>(null);

  const bounds = React.useMemo(
    () =>
      sheetTopBounds(containerHeight, {
        rowHeight: ROW_HEIGHT,
        collapsedHeight: SHEET_COLLAPSED_HEIGHT,
      }),
    [containerHeight]
  );

  React.useEffect(() => {
    if (containerHeight === 0) return;
    setSheetTop((current) => (current === null ? bounds.initial : clampSheetTop(current, bounds)));
  }, [containerHeight, bounds]);

  const onLayout = (e: LayoutChangeEvent) =>
    setContainerHeight(Math.round(e.nativeEvent.layout.height));

  const hourRange = React.useMemo(() => resolveHourRange(rangeEvents), [rangeEvents]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  return (
    <View className="flex-1 overflow-hidden" onLayout={onLayout}>
      <TimeGrid
        weekDays={days}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        eventsByDay={eventsByDay}
        hourRange={hourRange}
        nextEventId={nextEventId}
        onEventPress={onEventPress}
      />
      {sheetTop !== null ? (
        <DaySheet
          top={sheetTop}
          bounds={bounds}
          onTopChange={setSheetTop}
          day={selectedDay}
          events={dayEvents}
          nextEventId={nextEventId}
          levelCodeById={levelCodeById}
          onEventPress={onEventPress}
        />
      ) : null}
    </View>
  );
}
