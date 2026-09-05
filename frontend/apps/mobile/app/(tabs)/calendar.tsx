import { Ionicons } from "@expo/vector-icons";
import { findNextEventId, lightTheme } from "@levelup/config";
import { useCalendar, useCalendarEvents, useCoachLevels } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { addDays, format, isSameDay, isToday } from "date-fns";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const isCoach = user?.roles?.includes("coach") ?? false;

  // Week navigation first (pure), then fetch the visible week's events.
  // PAD-181: `language` localizes the week-range label in WeekStrip. Passing
  // `i18n.language` from useTranslation() (not a module-level import) is what
  // re-renders the label when the coach switches language.
  const calendar = useCalendar([], { language: i18n.language });
  const from = format(calendar.weekStart, "yyyy-MM-dd'T'00:00:00");
  const to = format(addDays(calendar.weekStart, 6), "yyyy-MM-dd'T'23:59:59");
  const {
    data: events,
    isPending,
    isError,
    refetch,
  } = useCalendarEvents(from, to);
  const { data: levels } = useCoachLevels();

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

  // One pass over the week: the strip needs every day's classes in start-time
  // order, and the detail list is just one of those buckets.
  const eventsByDay = React.useMemo(() => {
    const byDay: Record<string, CalendarEvent[]> = {};
    for (const event of events ?? []) {
      const key = eventDayKey(event);
      if (!key) continue;
      (byDay[key] ??= []).push(event);
    }
    for (const list of Object.values(byDay)) {
      list.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    }
    return byDay;
  }, [events]);

  const selectedDayKey = format(selectedDay, "yyyy-MM-dd");
  const dayEvents = eventsByDay[selectedDayKey] ?? [];

  const levelCodeById = React.useMemo(
    () => new Map((levels ?? []).map((l) => [String(l.id), l.code])),
    [levels]
  );

  // "Next" is a property of the whole visible set, not of one card. The gate is
  // the WEEK containing today — the same rule the web grid uses. Requiring the
  // SELECTED DAY to be today (which is what this screen used to imply by having
  // no highlight at all) meant tapping the day the next class actually falls on
  // showed nothing.
  const nextEventId = React.useMemo(
    () =>
      calendar.weekDays.some((d) => isToday(d))
        ? findNextEventId(events ?? [])
        : undefined,
    [events, calendar.weekDays]
  );

  const openEvent = (event: CalendarEvent) => {
    // PAD-160: non-class events have their own detail screen. Web branches the
    // same way (CalendarPage checks `event.type === "block"` and opens
    // EventDetailSheet instead of ClassDetailSheet); iOS used to route
    // everything to /class/[id], which is why a blocker was unreachable.
    if (event.type === "block") {
      router.push({
        pathname: "/event/[id]",
        params: {
          id: event.id,
          originalId: String(event.originalId),
          date: event.date ?? "",
          startTime: event.startTime ?? "",
          endTime: event.endTime ?? "",
          title: event.title ?? "",
        },
      });
      return;
    }
    router.push({ pathname: "/class/[id]", params: eventToParams(event) });
  };

  return (
    <Screen testID="screen-calendar">
      {/* SPLIT VIEW: the week's classes across the top, the selected day's
          detail underneath — mirroring apps/web's MobileCalendarView. */}
      <WeekStrip
        weekDays={calendar.weekDays}
        weekLabel={calendar.weekLabel}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        onPrevWeek={() => calendar.navigateWeek("prev")}
        onNextWeek={() => calendar.navigateWeek("next")}
        onToday={calendar.goToToday}
        eventsByDay={eventsByDay}
      />

      {isError ? (
        <ErrorState
          message={t("calendar.mobile.loadFailed")}
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
          <View>
            <Text className="font-semibold">
              {format(selectedDay, "EEEE, d MMMM")}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {t("calendar.mobile.classCount", { count: dayEvents.length })}
            </Text>
          </View>
          {dayEvents.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title={t("calendar.mobile.noClasses")}
              message={t("calendar.mobile.noClassesScheduled")}
              className="py-12"
            />
          ) : (
            dayEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onPress={openEvent}
                isNext={event.id === nextEventId}
                levelCode={
                  event.levelId !== undefined
                    ? levelCodeById.get(String(event.levelId))
                    : undefined
                }
              />
            ))
          )}
        </ScrollView>
      )}

      {/* "Add event" mirrors web's CalendarToolbar: available to every role
          (coach and student alike), unlike "Add class" which is coach-only. */}
      <Pressable
        testID="calendar-add-event"
        accessibilityLabel={t("calendar.toolbar.addEvent")}
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
          accessibilityLabel={t("calendar.toolbar.addClass")}
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
