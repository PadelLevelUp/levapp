import { useState } from 'react';
import { format, isToday, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarEvent } from '@/types';
import { CalendarEventCard } from './CalendarEventCard';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MobileCalendarViewProps {
  weekDays: Date[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export function MobileCalendarView({ weekDays, events, onEventClick }: MobileCalendarViewProps) {
  const [selectedDay, setSelectedDay] = useState<Date>(
    weekDays.find(d => isToday(d)) || weekDays[0]
  );

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return events.filter(e => e.date === dateStr);
  };

  const selectedDayEvents = getEventsForDay(selectedDay).sort((a, b) => 
    a.startTime.localeCompare(b.startTime)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Week Overview - Top Half */}
      <div className="flex-1 border-b border-border overflow-hidden">
        <div className="grid grid-cols-7 h-full">
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isSelected = isSameDay(day, selectedDay);
            const dayIsToday = isToday(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "flex flex-col p-1 border-r border-border last:border-r-0 transition-colors",
                  isSelected && "bg-primary/10",
                  !isSelected && "hover:bg-muted/50"
                )}
              >
                {/* Day Header */}
                <div className="text-center mb-1">
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {format(day, 'EEE', { locale: es })}
                  </p>
                  <p className={cn(
                    "text-sm font-medium w-7 h-7 mx-auto flex items-center justify-center rounded-full",
                    dayIsToday && "bg-primary text-primary-foreground",
                    isSelected && !dayIsToday && "bg-primary/20"
                  )}>
                    {format(day, 'd')}
                  </p>
                </div>

                {/* Stacked Event Titles */}
                <ScrollArea className="flex-1">
                  <div className="flex flex-col gap-0.5">
                    {dayEvents.slice(0, 5).map((event) => (
                      <div
                        key={event.id}
                        className="px-1 py-0.5 rounded text-[9px] truncate"
                        style={{ 
                          backgroundColor: event.color || (event.type === 'block' ? 'hsl(var(--muted))' : 'hsl(var(--primary))'),
                          color: event.type === 'block' ? 'hsl(var(--muted-foreground))' : 'white'
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 5 && (
                      <p className="text-[9px] text-muted-foreground text-center">
                        +{dayEvents.length - 5}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details - Bottom Half */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <h3 className="font-semibold">
            {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'clase' : 'clases'}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {selectedDayEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No hay clases programadas</p>
              </div>
            ) : (
              selectedDayEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="cursor-pointer"
                >
                  <CalendarEventCard 
                    event={event} 
                    style={{ position: 'relative', height: 'auto', minHeight: 60 }}
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
