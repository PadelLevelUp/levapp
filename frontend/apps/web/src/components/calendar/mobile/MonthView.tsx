import { useMemo } from "react";
import { format } from "date-fns";
import type { CalendarEvent, CoachLevel } from "@/types";
import { GridWithSheet } from "./GridWithSheet";
import { MonthGrid } from "./MonthGrid";
import { MonthNav } from "./MonthNav";

/**
 * The Mês mode — calendar.mobile-views rules 15–17 (PAD-248): month nav, the
 * month grid, then the selected day's single-column time grid with the day
 * sheet over it. The hour range comes from that day's events alone (rule 17).
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
  levels = [],
  onEventClick,
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
  levels?: CoachLevel[];
  onEventClick?: (event: CalendarEvent) => void;
  /** Rule 18: whether the day sheet is pulled above its resting height. */
  onSheetRaisedChange?: (raised: boolean) => void;
}) {
  const days = useMemo(() => [selectedDay], [selectedDay]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        levels={levels}
        onEventClick={onEventClick}
        onRaisedChange={onSheetRaisedChange}
      />
    </div>
  );
}
