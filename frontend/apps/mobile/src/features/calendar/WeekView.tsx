import type { CalendarEvent } from "@levelup/types";
import * as React from "react";
import { View } from "react-native";
import { GridWithSheet } from "./GridWithSheet";
import { WeekHeaderRow } from "./WeekHeaderRow";
import { WeekNav } from "./WeekNav";

/**
 * The Semana mode — calendar.mobile-views rules 3, 11–14 (PAD-247). React
 * Native port of apps/web's `WeekView`: nav row, day header row, then the
 * week's time grid with the day sheet over it.
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
  return (
    <View className="flex-1">
      <WeekNav weekLabel={weekLabel} onToday={onToday} onPrev={onPrevWeek} onNext={onNextWeek} />
      <WeekHeaderRow weekDays={weekDays} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      <GridWithSheet
        days={weekDays}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        eventsByDay={eventsByDay}
        rangeEvents={events}
        nextEventId={nextEventId}
        levelCodeById={levelCodeById}
        onEventPress={onEventPress}
      />
    </View>
  );
}
