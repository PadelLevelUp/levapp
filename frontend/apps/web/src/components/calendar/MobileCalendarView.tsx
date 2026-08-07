import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, isToday, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/dateLocale";
import type { CalendarEvent, CoachLevel } from "@/types";
import { CalendarEventCard } from "./CalendarEventCard";
import { findNextEventId, hasOpenSpots, resolveEventState } from "@/lib/calendar-status";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MobileCalendarViewProps {
  /** Coach levels, for the block's level chip. */
  levels?: CoachLevel[];
  weekDays: Date[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onDaySelect?: (day: Date) => void;
}

export function MobileCalendarView({
  weekDays,
  events,
  levels = [],
  onEventClick,
  onDaySelect,
}: MobileCalendarViewProps) {
  const { t, i18n } = useTranslation();
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
    return events
      .filter((e) => getEventDayKey(e) === dateStr)
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  };

  const selectedDayEvents = useMemo(() => {
    return getEventsForDay(selectedDay);
  }, [events, selectedDay]);

  // "Next" is a property of the whole set, not of one card — and it only means
  // anything while you are looking at today. Paging to a future day would
  // otherwise mark that day's first class as "next".
  const levelCodeById = useMemo(
    () => new Map(levels.map((l) => [String(l.id), l.code])),
    [levels]
  );

  const nextEventId = useMemo(
    () => (isToday(selectedDay) ? findNextEventId(events) : undefined),
    [events, selectedDay]
  );

  return (
    <div className="flex flex-col h-full">
      {/* The strip was flex-1 because it held stacks of title chips. Dots
          need a fraction of that, and taking half the screen for six dots
          pushed the day's actual classes below the fold. */}
      <div className="shrink-0 border-b border-border">
        <div className="grid grid-cols-7">
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isSelected = isSameDay(day, selectedDay);
            const dayIsToday = isToday(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => { setSelectedDay(day); onDaySelect?.(day); }}
                className={cn(
                  "flex flex-col p-1 border-r border-border last:border-r-0 transition-colors",
                  isSelected && "bg-primary/10",
                  !isSelected && "hover:bg-muted/50"
                )}
                type="button"
              >
                <div className="text-center mb-1">
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: dateFnsLocale(i18n.language) })}
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

                {/* A fill DOT per class, not a stack of chips. Titles at 9px
                    were unreadable and told you nothing you could act on; a
                    hollow dot means that class still has holes, so a day that
                    needs work is visible before you tap into it. */}
                <div className="flex min-h-[14px] flex-wrap justify-center content-start gap-1 px-0.5 pb-1">
                  {dayEvents.slice(0, 6).map((event) => {
                    const isBlock = event.type === "block";
                    const past = resolveEventState(event) === "past";
                    const holes = !past && hasOpenSpots(event);
                    const tint = event.color ?? "hsl(var(--primary))";

                    return (
                      <span
                        key={String(event.id)}
                        title={event.title}
                        data-testid="day-fill-dot"
                        data-event-title={event.title}
                        data-has-holes={holes ? "true" : "false"}
                        className={cn(
                          "h-2 w-2 rounded-full",
                          isBlock && "bg-muted-foreground/40",
                          past && "opacity-40"
                        )}
                        style={
                          isBlock
                            ? undefined
                            : holes
                              // Hollow = seats left.
                              ? { boxShadow: `inset 0 0 0 2px ${tint}` }
                              : { backgroundColor: tint }
                        }
                      />
                    );
                  })}
                  {dayEvents.length > 6 && (
                    <span className="text-[9px] leading-none text-muted-foreground">
                      +{dayEvents.length - 6}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <h3 className="font-semibold">
            {format(selectedDay, "EEEE, d MMMM", { locale: dateFnsLocale(i18n.language) })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("calendar.mobile.classCount", { count: selectedDayEvents.length })}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {selectedDayEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>{t("calendar.mobile.noClassesScheduled")}</p>
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
                  <CalendarEventCard
                    event={event}
                    isNext={event.id === nextEventId}
                    levelCode={
                      event.levelId !== undefined
                        ? levelCodeById.get(String(event.levelId))
                        : undefined
                    }
                    variant="row"
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
