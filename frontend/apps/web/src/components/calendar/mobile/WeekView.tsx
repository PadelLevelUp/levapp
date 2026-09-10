import type { CalendarEvent, CoachLevel } from "@/types";
import { GridWithSheet } from "./GridWithSheet";
import { WeekHeaderRow } from "./WeekHeaderRow";
import { WeekNav } from "./WeekNav";

/**
 * The Semana mode — calendar.mobile-views rules 3, 11–14 (PAD-247): nav row,
 * day header row, then the week's time grid with the day sheet over it. The
 * hour range comes from the whole week's events (rule 13).
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
  levels = [],
  onEventClick,
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
  levels?: CoachLevel[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WeekNav weekLabel={weekLabel} onToday={onToday} onPrev={onPrevWeek} onNext={onNextWeek} />
      <WeekHeaderRow weekDays={weekDays} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      <GridWithSheet
        days={weekDays}
        selectedDay={selectedDay}
        onSelectDay={onSelectDay}
        eventsByDay={eventsByDay}
        rangeEvents={events}
        nextEventId={nextEventId}
        levels={levels}
        onEventClick={onEventClick}
      />
    </div>
  );
}
