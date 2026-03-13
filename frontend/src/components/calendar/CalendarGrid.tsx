import { useMemo, useState } from 'react';
import { format, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/types';
import { CalendarEventCard } from './CalendarEventCard';

interface CalendarGridProps {
  weekDays: Date[];
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date, time: string) => void;
  onEventDrop?: (event: CalendarEvent, newDate: string, newStartTime: string) => void;
}

const HOUR_HEIGHT = 60; // pixels per hour - must match h-[60px] on grid rows

export function CalendarGrid({
  weekDays,
  events,
  startHour = 7,
  endHour = 22,
  onEventClick,
  onSlotClick,
  onEventDrop,
}: CalendarGridProps) {
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: string; time: string } | null>(null);

  const hours = useMemo(() =>
    Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );

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

  const handleSlotClick = (day: Date, hour: number, half: 'first' | 'second') => {
    if (onSlotClick) {
      const minutes = half === 'first' ? '00' : '30';
      onSlotClick(day, `${hour.toString().padStart(2, '0')}:${minutes}`);
    }
  };

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
              className={cn('relative border-l border-border', dayIsToday && 'bg-primary/[0.02]')}
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
              {hours.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-border/50">
                  <div
                    className={cn('h-1/2 transition-colors', onSlotClick && !draggingEvent && 'hover:bg-primary/5 cursor-pointer')}
                    onClick={() => !draggingEvent && handleSlotClick(day, hour, 'first')}
                  />
                  <div
                    className={cn('h-1/2 border-t border-dashed border-border/30 transition-colors', onSlotClick && !draggingEvent && 'hover:bg-primary/5 cursor-pointer')}
                    onClick={() => !draggingEvent && handleSlotClick(day, hour, 'second')}
                  />
                </div>
              ))}

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
