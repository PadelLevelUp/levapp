import { useMemo } from 'react';
import { format, isToday, parseISO } from 'date-fns';
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
}

const HOUR_HEIGHT = 80; // pixels per hour - increased for better event visibility
const SLOT_MINUTES = 30;

export function CalendarGrid({ 
  weekDays, 
  events, 
  startHour = 7, 
  endHour = 22,
  onEventClick,
  onSlotClick 
}: CalendarGridProps) {
  const hours = useMemo(() => 
    Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );

  const getEventStyle = (event: CalendarEvent) => {
    const [startH, startM] = event.startTime.split(':').map(Number);
    const [endH, endM] = event.endTime.split(':').map(Number);
    
    const startMinutes = (startH - startHour) * 60 + startM;
    const endMinutes = (endH - startHour) * 60 + endM;
    const duration = endMinutes - startMinutes;
    
    const top = (startMinutes / 60) * HOUR_HEIGHT;
    const height = Math.max((duration / 60) * HOUR_HEIGHT - 2, 20);
    
    return { top, height };
  };

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return events.filter(e => e.date === dateStr);
  };

  const handleSlotClick = (day: Date, hour: number, half: 'first' | 'second') => {
    if (onSlotClick) {
      const minutes = half === 'first' ? '00' : '30';
      const time = `${hour.toString().padStart(2, '0')}:${minutes}`;
      onSlotClick(day, time);
    }
  };

  function groupOverlappingEvents(events: CalendarEvent[]) {
    const groups: CalendarEvent[][] = [];

    events.forEach(event => {
      let placed = false;

      for (const group of groups) {
        const overlaps = group.some(e =>
          e.startTime < event.endTime &&
          event.startTime < e.endTime
        );

        if (overlaps) {
          group.push(event);
          placed = true;
          break;
        }
      }

      if (!placed) {
        groups.push([event]);
      }
    });

    return groups;
  }

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] min-h-full">
        {/* Time Column */}
        <div className="border-r border-border">
          {hours.map((hour) => (
            <div 
              key={hour} 
              className="h-[60px] relative"
            >
              <span className="absolute -top-2.5 right-2 text-xs text-muted-foreground">
                {hour.toString().padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day Columns */}
        {weekDays.map((day) => {
          const dayEvents = getEventsForDay(day);
          const dayIsToday = isToday(day);
          
          return (
            <div 
              key={day.toISOString()} 
              className={cn(
                "relative border-l border-border",
                dayIsToday && "bg-primary/[0.02]"
              )}
            >
              {/* Hour Grid Lines */}
              {hours.map((hour) => (
                <div key={hour} className="h-[60px] border-b border-border/50">
                  <div 
                    className="h-1/2 hover:bg-primary/5 cursor-pointer transition-colors"
                    onClick={() => handleSlotClick(day, hour, 'first')}
                  />
                  <div 
                    className="h-1/2 border-t border-dashed border-border/30 hover:bg-primary/5 cursor-pointer transition-colors"
                    onClick={() => handleSlotClick(day, hour, 'second')}
                  />
                </div>
              ))}

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
                      }}
                      onClick={() => onEventClick?.(event)}
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
