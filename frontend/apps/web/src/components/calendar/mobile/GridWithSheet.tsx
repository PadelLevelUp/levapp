import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { clampSheetTop, isSheetRaised, resolveHourRange, SHEET_COLLAPSED_HEIGHT, sheetTopBounds } from "@levelup/config";
import type { CalendarEvent, CoachLevel } from "@/types";
import { DaySheet } from "./DaySheet";
import { ROW_HEIGHT, TimeGrid } from "./TimeGrid";

/**
 * The time grid with the day sheet dragged over it — calendar.mobile-views
 * rules 3, 13, 14 and 17. Semana passes the week's seven days and the week's
 * events for the hour range; Mês passes the selected day alone and that day's
 * events (rule 17), plus the month grid as `above`, so the sheet's container
 * spans both and it can rise over the month grid (PAD-286). The container and
 * the `above` block are measured so the sheet's travel (shared
 * `sheetTopBounds`) is in real pixels, and the sheet re-clamps on resize.
 */
export function GridWithSheet({
  days,
  selectedDay,
  onSelectDay,
  eventsByDay,
  rangeEvents,
  nextEventId,
  levels = [],
  onEventClick,
  onRaisedChange,
  above,
}: {
  /** The grid's columns. */
  days: Date[];
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  eventsByDay: Record<string, CalendarEvent[]>;
  /** The events the visible hour range is derived from. */
  rangeEvents: CalendarEvent[];
  nextEventId?: string;
  levels?: CoachLevel[];
  onEventClick?: (event: CalendarEvent) => void;
  /** Called with whether the sheet is above its resting height (rule 18). */
  onRaisedChange?: (raised: boolean) => void;
  /** Rendered above the grid, inside the sheet's travel (Mês: the month grid). */
  above?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aboveRef = useRef<HTMLDivElement>(null);
  // `above` is a fresh JSX node every render; the effects only care whether there is one.
  const hasAbove = above !== undefined;
  const [containerHeight, setContainerHeight] = useState(0);
  const [gridTop, setGridTop] = useState(0);
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

  useEffect(() => {
    const el = aboveRef.current;
    if (!el) {
      setGridTop(0);
      return;
    }
    const measure = () => setGridTop(Math.round(el.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAbove]);

  const bounds = useMemo(
    () =>
      sheetTopBounds(containerHeight, {
        rowHeight: ROW_HEIGHT,
        collapsedHeight: SHEET_COLLAPSED_HEIGHT,
        gridTop,
      }),
    [containerHeight, gridTop]
  );

  // First measurement opens the sheet at its default; later ones only re-clamp.
  // With an `above` block the default depends on its height too, so wait for it.
  useEffect(() => {
    if (containerHeight === 0) return;
    if (hasAbove && gridTop === 0) return;
    setSheetTop((current) => (current === null ? bounds.initial : clampSheetTop(current, bounds)));
  }, [containerHeight, gridTop, hasAbove, bounds]);

  // Rule 18 (Mês): tell the shell whether the sheet sits above its resting
  // height so it can hide the floating add buttons; reset when unmounted.
  useEffect(() => {
    if (!onRaisedChange) return;
    onRaisedChange(sheetTop !== null && isSheetRaised(sheetTop, bounds));
  }, [sheetTop, bounds, onRaisedChange]);
  useEffect(() => () => onRaisedChange?.(false), [onRaisedChange]);

  const hourRange = useMemo(() => resolveHourRange(rangeEvents), [rangeEvents]);
  const dayEvents = eventsByDay[format(selectedDay, "yyyy-MM-dd")] ?? [];
  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {hasAbove && (
        <div ref={aboveRef} className="shrink-0">
          {above}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <TimeGrid
          className="absolute inset-0"
          weekDays={days}
          selectedDay={selectedDay}
          onSelectDay={onSelectDay}
          eventsByDay={eventsByDay}
          hourRange={hourRange}
          nextEventId={nextEventId}
          onEventClick={onEventClick}
        />
      </div>
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
  );
}
