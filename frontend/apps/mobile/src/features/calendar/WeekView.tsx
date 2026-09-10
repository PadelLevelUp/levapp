import { clampSheetTop, resolveHourRange, sheetTopBounds } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format } from "date-fns";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { DaySheet, SHEET_COLLAPSED_HEIGHT } from "./DaySheet";
import { ROW_HEIGHT, TimeGrid } from "./TimeGrid";
import { WeekHeaderRow } from "./WeekHeaderRow";
import { WeekNav } from "./WeekNav";

/**
 * The Semana mode — calendar.mobile-views rules 3, 11–14 (PAD-247). React
 * Native port of apps/web's `WeekView`: nav row, day header row, the time
 * grid, and the day sheet over it. The grid container is measured with
 * `onLayout` so the sheet's travel is in real points.
 */
export function WeekView({
  weekDays,
  weekLabel,
  selectedDay,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  onToday,
  events,
  eventsByDay,
  nextEventId,
  levelCodeById,
  onEventPress,
}: {
  weekDays: Date[];
  weekLabel: string;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  events: CalendarEvent[];
  eventsByDay: Record<string, CalendarEvent[]>;
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

  const hourRange = React.useMemo(() => resolveHourRange(events), [events]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  return (
    <View className="flex-1">
      <WeekNav weekLabel={weekLabel} onToday={onToday} onPrev={onPrevWeek} onNext={onNextWeek} />
      <WeekHeaderRow weekDays={weekDays} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      <View className="flex-1 overflow-hidden" onLayout={onLayout}>
        <TimeGrid
          weekDays={weekDays}
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
    </View>
  );
}
