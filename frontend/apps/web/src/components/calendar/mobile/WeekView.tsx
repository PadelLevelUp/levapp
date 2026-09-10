import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { clampSheetTop, resolveHourRange, sheetTopBounds } from "@levelup/config";
import type { CalendarEvent, CoachLevel } from "@/types";
import { DaySheet, SHEET_COLLAPSED_HEIGHT } from "./DaySheet";
import { ROW_HEIGHT, TimeGrid } from "./TimeGrid";
import { WeekHeaderRow } from "./WeekHeaderRow";
import { WeekNav } from "./WeekNav";

/**
 * The Semana mode — calendar.mobile-views rules 3, 11–14 (PAD-247): nav row,
 * day header row, the time grid, and the day sheet dragged over it. The grid
 * container is measured so the sheet's travel (shared `sheetTopBounds`) is
 * expressed in real pixels, and the sheet re-clamps if the container resizes.
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [sheetTop, setSheetTop] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerHeight(Math.round(el.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bounds = useMemo(
    () =>
      sheetTopBounds(containerHeight, {
        rowHeight: ROW_HEIGHT,
        collapsedHeight: SHEET_COLLAPSED_HEIGHT,
      }),
    [containerHeight]
  );

  // First measurement opens the sheet at its default; later ones only re-clamp.
  useEffect(() => {
    if (containerHeight === 0) return;
    setSheetTop((current) => (current === null ? bounds.initial : clampSheetTop(current, bounds)));
  }, [containerHeight, bounds]);

  const hourRange = useMemo(() => resolveHourRange(events), [events]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];
  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WeekNav weekLabel={weekLabel} onToday={onToday} onPrev={onPrevWeek} onNext={onNextWeek} />
      <WeekHeaderRow weekDays={weekDays} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <TimeGrid
          className="absolute inset-0"
          weekDays={weekDays}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          eventsByDay={eventsByDay}
          hourRange={hourRange}
          nextEventId={nextEventId}
          onEventClick={onEventClick}
        />
        {sheetTop !== null && (
          <DaySheet
            top={sheetTop}
            bounds={bounds}
            onTopChange={setSheetTop}
            day={selectedDay}
            events={dayEvents}
            nextEventId={nextEventId}
            levelCodeById={levelCodeById}
            onEventClick={onEventClick}
          />
        )}
      </div>
    </div>
  );
}
