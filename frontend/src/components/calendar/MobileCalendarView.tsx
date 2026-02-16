import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, isToday, parseISO } from "date-fns";
import { enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";
import { CalendarEventCard } from "./CalendarEventCard";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MobileCalendarViewProps {
  weekDays: Date[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
}

export function MobileCalendarView({
  weekDays,
  events,
  onEventClick,
}: MobileCalendarViewProps) {
  const initialSelectedDay = useMemo(() => {
    return weekDays.find((d) => isToday(d)) || weekDays[0];
  }, [weekDays]);

  const [selectedDay, setSelectedDay] = useState<Date>(initialSelectedDay);

  useEffect(() => {
    const stillInWeek = weekDays.some((d) => isSameDay(d, selectedDay));
    if (stillInWeek) return;

    const next = weekDays.find((d) => isToday(d)) || weekDays[0];
    setSelectedDay(next);
  }, [weekDays, selectedDay]);

  const getEventDayKey = (e: CalendarEvent) => {
    if (typeof e.date !== "string") return "";
    if (e.date.length >= 10 && e.date[4] === "-" && e.date[7] === "-") {
      return e.date.slice(0, 10);
    }
    try {
      return format(parseISO(e.date), "yyyy-MM-dd");
    } catch {
      return "";
    }
  };

  const getEventsForDay = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return events.filter((e) => getEventDayKey(e) === dateStr);
  };

  const selectedDayEvents = useMemo(() => {
    return getEventsForDay(selectedDay)
      .slice()
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [events, selectedDay]);

  return (
    <div className="flex flex-col h-full">
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
                type="button"
              >
                <div className="text-center mb-1">
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: enUS })}
                  </p>
                  <p
                    className={cn(
                      "text-sm font-medium w-7 h-7 mx-auto flex items-center justify-center rounded-full",
                      dayIsToday && "bg-primary text-primary-foreground",
                      isSelected && !dayIsToday && "bg-primary/20"
                    )}
                  >
                    {format(day, "d")}
                  </p>
                </div>

                <ScrollArea className="flex-1">
                  <div className="flex flex-col gap-1 px-0.5">
                    {dayEvents.slice(0, 4).map((event) => {
                      const isBlock =
                        (event as any).type === "block" ||
                        (event as any).isBlock === true;

                      return (
                        <div
                          key={String(event.id)}
                          className="px-1.5 py-1.5 rounded text-[9px] leading-tight line-clamp-3 min-h-[32px]"
                          style={{
                            backgroundColor:
                              event.color ||
                              (isBlock
                                ? "hsl(var(--muted))"
                                : "hsl(var(--primary))"),
                            color: isBlock
                              ? "hsl(var(--muted-foreground))"
                              : "white",
                          }}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 4 && (
                      <p className="text-[9px] text-muted-foreground text-center">
                        +{dayEvents.length - 4}
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <h3 className="font-semibold">
            {format(selectedDay, "EEEE d 'de' MMMM", { locale: enUS })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {selectedDayEvents.length}{" "}
            {selectedDayEvents.length === 1 ? "class" : "classes"}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {selectedDayEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No classes scheduled</p>
              </div>
            ) : (
              selectedDayEvents.map((event) => (
                <div
                  key={String(event.id)}
                  onClick={() => onEventClick?.(event)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onEventClick?.(event);
                    }
                  }}
                >
                  <CalendarEventCard event={event} />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
