import { clampSheetTop, isSheetRaised, resolveHourRange, SHEET_COLLAPSED_HEIGHT, sheetTopBounds } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { format } from "date-fns";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { DaySheet } from "./DaySheet";
import { ROW_HEIGHT, TimeGrid } from "./TimeGrid";

/**
 * The time grid with the day sheet over it — calendar.mobile-views rules 3,
 * 13, 14 and 17. React Native port of apps/web's `GridWithSheet`: Semana
 * passes the week's days and events, Mês the selected day alone and that
 * day's events plus the month grid as `above`, so the sheet can rise over it
 * (PAD-286). Measured with `onLayout` so the sheet's travel is in points.
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
  onRaisedChange,
  above,
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
  /** Called with whether the sheet is above its resting height (rule 18). */
  onRaisedChange?: (raised: boolean) => void;
  /** Rendered above the grid, inside the sheet's travel (Mês: the month grid). */
  above?: React.ReactNode;
}) {
  const [containerHeight, setContainerHeight] = React.useState(0);
  const [gridTop, setGridTop] = React.useState(0);
  // `above` is a fresh JSX node every render; the memo and effects only care whether there is one.
  const hasAbove = above !== undefined;
  const [sheetTop, setSheetTop] = React.useState<number | null>(null);

  const bounds = React.useMemo(
    () =>
      sheetTopBounds(containerHeight, {
        rowHeight: ROW_HEIGHT,
        collapsedHeight: SHEET_COLLAPSED_HEIGHT,
        gridTop: hasAbove ? gridTop : 0,
      }),
    [containerHeight, gridTop, hasAbove]
  );

  // First measurement opens the sheet at its default; later ones only re-clamp.
  // With an `above` block the default depends on its height too, so wait for it
  // (onLayout order between the container and its child is not guaranteed).
  React.useEffect(() => {
    if (containerHeight === 0) return;
    if (hasAbove && gridTop === 0) return;
    setSheetTop((current) => (current === null ? bounds.initial : clampSheetTop(current, bounds)));
  }, [containerHeight, gridTop, hasAbove, bounds]);

  // Rule 18 (Mês): tell the screen whether the sheet sits above its resting
  // height so it can hide the floating add buttons; reset when unmounted.
  React.useEffect(() => {
    if (!onRaisedChange) return;
    onRaisedChange(sheetTop !== null && isSheetRaised(sheetTop, bounds));
  }, [sheetTop, bounds, onRaisedChange]);
  React.useEffect(() => () => onRaisedChange?.(false), [onRaisedChange]);

  const onLayout = (e: LayoutChangeEvent) =>
    setContainerHeight(Math.round(e.nativeEvent.layout.height));
  const onAboveLayout = (e: LayoutChangeEvent) =>
    setGridTop(Math.round(e.nativeEvent.layout.height));

  const hourRange = React.useMemo(() => resolveHourRange(rangeEvents), [rangeEvents]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  return (
    <View className="flex-1 overflow-hidden" onLayout={onLayout}>
      {hasAbove ? <View onLayout={onAboveLayout}>{above}</View> : null}
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
