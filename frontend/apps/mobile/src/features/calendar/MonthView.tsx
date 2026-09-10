import type { CalendarEvent } from "@levelup/types";
import { format } from "date-fns";
import * as React from "react";
import { View } from "react-native";
import { GridWithSheet } from "./GridWithSheet";
import { MonthGrid } from "./MonthGrid";
import { MonthNav } from "./MonthNav";

/**
 * The Mês mode — calendar.mobile-views rules 15–17 (PAD-248). React Native
 * port of apps/web's `MonthView`: month nav, month grid, then the selected
 * day's single-column time grid with the day sheet over it (hour range from
 * that day's events alone).
 */
export function MonthView({
  monthLabel,
  monthDays,
  monthStart,
  selectedDay,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  eventsByDay,
  nextEventId,
  levelCodeById,
  onEventPress,
  onSheetRaisedChange,
}: {
  monthLabel: string;
  monthDays: Date[];
  monthStart: Date;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  eventsByDay: Record<string, CalendarEvent[]>;
  nextEventId?: string;
  levelCodeById: Map<string, string>;
  onEventPress?: (event: CalendarEvent) => void;
  /** Rule 18: whether the day sheet is pulled above its resting height. */
  onSheetRaisedChange?: (raised: boolean) => void;
}) {
  const days = React.useMemo(() => [selectedDay], [selectedDay]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  return (
    <View className="flex-1">
      <MonthNav monthLabel={monthLabel} onPrev={onPrevMonth} onNext={onNextMonth} />
      <MonthGrid
        monthDays={monthDays}
        monthStart={monthStart}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        eventsByDay={eventsByDay}
      />
      <GridWithSheet
        days={days}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        eventsByDay={eventsByDay}
        rangeEvents={dayEvents}
        nextEventId={nextEventId}
        levelCodeById={levelCodeById}
        onEventPress={onEventPress}
        onRaisedChange={onSheetRaisedChange}
      />
    </View>
  );
}
