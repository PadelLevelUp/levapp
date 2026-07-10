import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useCalendar, useCalendarEvents } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { addDays, format, isSameDay, isToday } from "date-fns";
import { router } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { EventCard } from "@/features/calendar/EventCard";
import { eventToParams } from "@/features/calendar/params";
import { WeekStrip } from "@/features/calendar/WeekStrip";
import { cn } from "@/lib/utils";

function eventDayKey(event: CalendarEvent): string {
  const date = event.date;
  if (typeof date !== "string") return "";
  return date.slice(0, 10);
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;

  // Week navigation first (pure), then fetch the visible week's events.
  const calendar = useCalendar([]);
  const from = format(calendar.weekStart, "yyyy-MM-dd'T'00:00:00");
  const to = format(addDays(calendar.weekStart, 6), "yyyy-MM-dd'T'23:59:59");
  const {
    data: events,
    isPending,
    isError,
    refetch,
  } = useCalendarEvents(from, to);

  // Selected day: today when visible, otherwise the first day of the week.
  const [selectedDay, setSelectedDay] = React.useState<Date>(
    () => calendar.weekDays.find((d) => isToday(d)) ?? calendar.weekDays[0]
  );
  React.useEffect(() => {
    const stillInWeek = calendar.weekDays.some((d) => isSameDay(d, selectedDay));
    if (!stillInWeek) {
      setSelectedDay(
        calendar.weekDays.find((d) => isToday(d)) ?? calendar.weekDays[0]
      );
    }
  }, [calendar.weekDays, selectedDay]);

  const eventCountByDay = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of events ?? []) {
      const key = eventDayKey(event);
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  const selectedDayKey = format(selectedDay, "yyyy-MM-dd");
  const dayEvents = React.useMemo(
    () =>
      (events ?? [])
        .filter((event) => eventDayKey(event) === selectedDayKey)
        .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")),
    [events, selectedDayKey]
  );

  const openEvent = (event: CalendarEvent) => {
    router.push({ pathname: "/class/[id]", params: eventToParams(event) });
  };

  return (
    <Screen testID="screen-calendar">
      <WeekStrip
        weekDays={calendar.weekDays}
        weekLabel={calendar.weekLabel}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onPrevWeek={() => calendar.navigateWeek("prev")}
        onNextWeek={() => calendar.navigateWeek("next")}
        onToday={calendar.goToToday}
        eventCountByDay={eventCountByDay}
      />

      {isError ? (
        <ErrorState
          message="Could not load the calendar."
          onRetry={() => refetch()}
        />
      ) : isPending ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-2 p-4 pb-24"
        >
          <Text className="text-sm font-semibold text-muted-foreground">
            {format(selectedDay, "EEEE, MMMM d")}
          </Text>
          {dayEvents.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No classes"
              message="Nothing scheduled for this day."
              className="py-12"
            />
          ) : (
            dayEvents.map((event) => (
              <EventCard key={event.id} event={event} onPress={openEvent} />
            ))
          )}
        </ScrollView>
      )}

      {/* "Add event" mirrors web's CalendarToolbar: available to every role
          (coach and student alike), unlike "Add class" which is coach-only. */}
      <Pressable
        testID="calendar-add-event"
        accessibilityLabel="Add event"
        role="button"
        onPress={() =>
          router.push({
            pathname: "/event/new",
            params: { date: selectedDayKey },
          })
        }
        className={cn(
          "absolute right-6 h-12 w-12 items-center justify-center rounded-full border border-border bg-card shadow-lg active:opacity-90",
          isCoach ? "bottom-24" : "bottom-6"
        )}
      >
        <Ionicons
          name="calendar-outline"
          size={22}
          color={lightTheme.foreground}
        />
      </Pressable>

      {isCoach ? (
        <Pressable
          testID="calendar-add-class"
          accessibilityLabel="Add class"
          role="button"
          onPress={() =>
            router.push({
              pathname: "/class/new",
              params: { date: selectedDayKey },
            })
          }
          className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-90"
        >
          <Ionicons name="add" size={28} color={lightTheme.primaryForeground} />
        </Pressable>
      ) : null}
    </Screen>
  );
}
