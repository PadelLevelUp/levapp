import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findNextEventId } from '@/lib/calendar-status';
import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarEvent, CoachLevel } from '@/types';
import { CalendarEventCard } from './CalendarEventCard';

interface CalendarGridProps {
  weekDays: Date[];
  events: CalendarEvent[];
  /** Coach levels, for the block's level chip. */
  levels?: CoachLevel[];
  startHour?: number;
  endHour?: number;
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date, time: string) => void;
  /**
   * PAD-106: fired when the coach drags across two or more slots. A drag that
   * starts and ends on the same slot is a plain click and goes to `onSlotClick`
   * instead, so single-slot behaviour is literally unchanged.
   */
  onSlotRangeSelect?: (date: Date, startTime: string, endTime: string) => void;
  onEventDrop?: (event: CalendarEvent, newDate: string, newStartTime: string) => void;
}

const HOUR_HEIGHT = 60; // pixels per hour - must match h-[60px] on grid rows
const SLOT_HEIGHT = HOUR_HEIGHT / 2; // one half-hour slot
const SLOT_MINUTES = 30;

/** In-progress drag selection, anchored to the column the drag started in. */
interface SlotSelection {
  dayStr: string;
  /** Slot index the mouse went down on. */
  anchor: number;
  /** Slot index the mouse is currently over (may be above the anchor). */
  focus: number;
}

export function CalendarGrid({
  weekDays,
  events,
  levels = [],
  startHour = 7,
  endHour = 22,
  onEventClick,
  onSlotClick,
  onSlotRangeSelect,
  onEventDrop,
}: CalendarGridProps) {
  // Which class is "next" is a property of the whole visible set, so it is
  // resolved here and passed down rather than guessed inside each card.
  //
  // Gated on the view containing today: without this, paging to any future
  // week marks that week's first class as "next", so the highlight appears
  // everywhere and stops meaning anything.
  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  const nextEventId = useMemo(
    () => (weekDays.some((d) => isToday(d)) ? findNextEventId(events) : undefined),
    [events, weekDays]
  );

  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: string; time: string } | null>(null);
  const [selection, setSelection] = useState<SlotSelection | null>(null);

  const hours = useMemo(() =>
    Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );

  const slotCount = (endHour - startHour) * 2;

  /**
   * Start-of-day time for a half-hour slot index. `index === slotCount` is the
   * exclusive end of the last slot (i.e. `endHour:00`), which is what a range's
   * end time uses.
   */
  const slotTime = useCallback((index: number) => {
    const total = startHour * 60 + index * SLOT_MINUTES;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }, [startHour]);

  const getEventStyle = (event: CalendarEvent) => {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    const startMinutes = (startH - startHour) * 60 + startM;
    const endMinutes = (endH - startHour) * 60 + endM;
    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT - 2, 20);
    return { top, height };
  };

  const getEventsForDay = (day: Date) =>
    events.filter(e => e.date === format(day, 'yyyy-MM-dd'));

  /**
   * PAD-106 — drag-to-select.
   *
   * The gesture is a single code path: mousedown anchors, mousemove extends,
   * mouseup resolves. A plain click is just the zero-length case, which keeps
   * the pre-existing single-slot behaviour intact by construction rather than
   * by a second handler that would have to be suppressed during a drag.
   *
   * Listeners go on `document` synchronously inside mousedown (not via an
   * effect keyed on state) so a fast press-release can't outrun a React commit,
   * and so a release outside the grid is still seen.
   */
  const dragRef = useRef<{
    day: Date;
    dayStr: string;
    column: HTMLElement;
    anchor: number;
    focus: number;
    cleanup: () => void;
  } | null>(null);

  /** Clamp a viewport Y to a half-hour slot index within the origin column. */
  const slotIndexFromY = useCallback((column: HTMLElement, clientY: number) => {
    const rect = column.getBoundingClientRect();
    const raw = Math.floor((clientY - rect.top) / SLOT_HEIGHT);
    return Math.min(Math.max(raw, 0), slotCount - 1);
  }, [slotCount]);

  const endDrag = useCallback((resolve: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    drag.cleanup();
    setSelection(null);

    if (!resolve) return;

    const from = Math.min(drag.anchor, drag.focus);
    const to = Math.max(drag.anchor, drag.focus);

    if (from === to) {
      // Zero-length drag === click. Unchanged single-slot behaviour.
      onSlotClick?.(drag.day, slotTime(from));
      return;
    }

    // A range ends at the LAST covered slot's start + 30 min, so 10:00 → 10:30
    // covers 10:00–11:00.
    onSlotRangeSelect?.(drag.day, slotTime(from), slotTime(to + 1));
  }, [onSlotClick, onSlotRangeSelect, slotTime]);

  const beginDrag = (
    e: React.MouseEvent<HTMLDivElement>,
    day: Date,
    dayStr: string,
    index: number
  ) => {
    // Left button only, coaches only (no `onSlotClick` ⇒ read-only calendar),
    // and never while an event is being dragged to reschedule.
    if (e.button !== 0 || draggingEvent || !onSlotClick) return;
    const column = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-day-column]');
    if (!column) return;

    // Stops the browser turning the drag into a text selection.
    e.preventDefault();

    const onMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      // X is ignored on purpose: the range is locked to the origin column, so a
      // selection never spans two days (Google Calendar week-view behaviour).
      const focus = slotIndexFromY(drag.column, ev.clientY);
      if (focus === drag.focus) return;
      drag.focus = focus;
      setSelection({ dayStr: drag.dayStr, anchor: drag.anchor, focus });
    };
    const onMouseUp = () => endDrag(true);
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') endDrag(false);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);

    dragRef.current = {
      day,
      dayStr,
      column,
      anchor: index,
      focus: index,
      cleanup: () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('keydown', onKeyDown);
      },
    };
    setSelection({ dayStr, anchor: index, focus: index });
  };

  // Unmounting mid-drag (week change, navigation) must not leave listeners behind.
  useEffect(() => () => {
    dragRef.current?.cleanup();
    dragRef.current = null;
  }, []);

  /** Snap mouse Y to nearest 30-min slot time string (HH:MM) */
  const snapTimeFromY = (colEl: HTMLElement, clientY: number): string => {
    const rect = colEl.getBoundingClientRect();
    const y = Math.max(0, clientY - rect.top);
    const rawMinutes = (y / HOUR_HEIGHT) * 60;
    const snapped = Math.round(rawMinutes / 30) * 30;
    const hour = Math.floor(snapped / 60) + startHour;
    const minute = snapped % 60;
    const clampedHour = Math.min(hour, endHour - 1);
    return `${String(clampedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  function groupOverlappingEvents(events: CalendarEvent[]) {
    const groups: CalendarEvent[][] = [];
    events.forEach(event => {
      let placed = false;
      for (const group of groups) {
        if (group.some(e => e.startTime < event.endTime && event.startTime < e.endTime)) {
          group.push(event);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push([event]);
    });
    return groups;
  }

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] min-h-full">
        {/* Time Column */}
        <div className="border-r border-border">
          {hours.map((hour) => (
            <div key={hour} className="h-[60px] relative">
              <span className="absolute -top-2.5 right-2 text-xs text-muted-foreground">
                {hour.toString().padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day Columns */}
        {weekDays.map((day) => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayEvents = getEventsForDay(day);
          const dayIsToday = isToday(day);
          const ghostTime = dropTarget?.day === dayStr ? dropTarget.time : null;

          return (
            <div
              key={day.toISOString()}
              data-day-column={dayStr}
              className={cn(
                'relative border-l border-border select-none',
                dayIsToday && 'bg-primary/[0.02]'
              )}
              onDragOver={(e) => {
                e.preventDefault();
                const time = snapTimeFromY(e.currentTarget, e.clientY);
                setDropTarget({ day: dayStr, time });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingEvent && dropTarget?.day === dayStr) {
                  onEventDrop?.(draggingEvent, dayStr, dropTarget.time);
                }
                setDraggingEvent(null);
                setDropTarget(null);
              }}
            >
              {/* Hour Grid Lines */}
              {hours.map((hour, hourIndex) => {
                const firstHalfIndex = hourIndex * 2;
                return (
                  <div key={hour} className="h-[60px] border-b border-border/50">
                    <div
                      data-slot={`${dayStr}T${slotTime(firstHalfIndex)}`}
                      className={cn('h-1/2 transition-colors', onSlotClick && !draggingEvent && 'hover:bg-primary/5 cursor-pointer')}
                      onMouseDown={(e) => beginDrag(e, day, dayStr, firstHalfIndex)}
                    />
                    <div
                      data-slot={`${dayStr}T${slotTime(firstHalfIndex + 1)}`}
                      className={cn('h-1/2 border-t border-dashed border-border/30 transition-colors', onSlotClick && !draggingEvent && 'hover:bg-primary/5 cursor-pointer')}
                      onMouseDown={(e) => beginDrag(e, day, dayStr, firstHalfIndex + 1)}
                    />
                  </div>
                );
              })}

              {/* PAD-106: live range highlight while dragging */}
              {selection?.dayStr === dayStr && (() => {
                const from = Math.min(selection.anchor, selection.focus);
                const to = Math.max(selection.anchor, selection.focus);
                return (
                  <div
                    data-slot-selection={`${slotTime(from)}-${slotTime(to + 1)}`}
                    className="absolute left-0 right-0 rounded-md border-2 border-primary bg-primary/20 pointer-events-none z-10"
                    style={{ top: from * SLOT_HEIGHT, height: (to - from + 1) * SLOT_HEIGHT }}
                  />
                );
              })()}

              {/* Drop ghost */}
              {draggingEvent && ghostTime && (() => {
                const [sh, sm] = draggingEvent.startTime.split(':').map(Number);
                const [eh, em] = draggingEvent.endTime.split(':').map(Number);
                const durationMin = (eh * 60 + em) - (sh * 60 + sm);
                const [th, tm] = ghostTime.split(':').map(Number);
                const top = ((th - startHour) * 60 + tm) / 60 * HOUR_HEIGHT;
                const height = Math.max((durationMin / 60) * HOUR_HEIGHT - 2, 20);
                return (
                  <div
                    className="absolute left-0 right-0 rounded-md border-2 border-dashed border-primary bg-primary/15 pointer-events-none z-10"
                    style={{ top, height }}
                  />
                );
              })()}

              {/* Events */}
              {groupOverlappingEvents(dayEvents).flatMap(group =>
                group.map((event, index) => {
                  const style = getEventStyle(event);
                  const columnWidth = 100 / group.length;
                  return (
                    <CalendarEventCard
                      key={event.id}
                      event={event}
                      isNext={event.id === nextEventId}
                      levelCode={
                        event.levelId !== undefined
                          ? levelCodeById.get(String(event.levelId))
                          : undefined
                      }
                      // Too short OR too narrow: three overlapping classes leave ~1/3
                      // of a column, where a bar and a count are illegible.
                      compact={parseFloat(String(style.height)) < 56 || group.length > 2}
                      style={{
                        position: 'absolute',
                        top: style.top,
                        left: `${index * columnWidth}%`,
                        width: `${columnWidth}%`,
                        height: style.height,
                        opacity: draggingEvent?.id === event.id ? 0.3 : undefined,
                      }}
                      onClick={() => !draggingEvent && onEventClick?.(event)}
                      onDragStart={() => setDraggingEvent(event)}
                      onDragEnd={() => { setDraggingEvent(null); setDropTarget(null); }}
                    />
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
