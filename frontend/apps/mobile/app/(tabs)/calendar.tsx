import { Ionicons } from "@expo/vector-icons";
import { findNextEventId, lightTheme } from "@levelup/config";
import {
  useCalendar,
  useCalendarEvents,
  useCoachLevels,
  type CalendarViewMode,
} from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { addDays, format, isToday } from "date-fns";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { DayHeader } from "@/features/calendar/DayHeader";
import { DayStrip } from "@/features/calendar/DayStrip";
import { EventCard } from "@/features/calendar/EventCard";
import { eventToParams } from "@/features/calendar/params";
import { ViewModeControl } from "@/features/calendar/ViewModeControl";
import { WeekView } from "@/features/calendar/WeekView";
import { MonthView } from "@/features/calendar/MonthView";
import { FAB_CLEARANCE } from "@/features/calendar/layout";
import { cn } from "@/lib/utils";
import { readViewMode, writeViewMode } from "@/lib/view-mode-store";

/** Modes that have shipped: Dia (PAD-246), Semana (PAD-247), Mês (PAD-248). */
const ENABLED_VIEW_MODES: CalendarViewMode[] = ["day", "week", "month"];

function eventDayKey(event: CalendarEvent): string {
  const date = event.date;
  if (typeof date !== "string") return "";
  return date.slice(0, 10);
}

export default function CalendarScreen() {
  // The stored mode is read once before the calendar mounts, so the first
  // render already opens in the remembered mode instead of flashing Dia.
  const [initialViewMode, setInitialViewMode] = React.useState<CalendarViewMode | null>(
    null
  );
  React.useEffect(() => {
    let alive = true;
    readViewMode(ENABLED_VIEW_MODES).then((mode) => {
      if (alive) setInitialViewMode(mode);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!initialViewMode) {
    return (
      <Screen testID="screen-calendar">
        <View className="gap-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </View>
      </Screen>
    );
  }

  return <CalendarBody initialViewMode={initialViewMode} />;
}

function CalendarBody({ initialViewMode }: { initialViewMode: CalendarViewMode }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isCoach = user?.roles?.includes("coach") ?? false;
  // PAD-248 rule 18: in Mês the add buttons step aside while the day sheet is pulled up.
  const [addButtonsHidden, setAddButtonsHidden] = React.useState(false);

  // Week navigation, the selected day and the view mode all live in the
  // shared hook (calendar.mobile-views rule 2) — this screen never re-decides
  // the reselect rule web follows. PAD-181: `language` localizes the labels.
  const calendar = useCalendar([], {
    language: i18n.language,
    initialViewMode,
    onViewModeChange: writeViewMode,
  });
  // PAD-248: Mês fetches the whole grid (every week touching the month);
  // Dia and Semana fetch the visible week.
  const isMonth = calendar.viewMode === "month";
  const rangeStart = isMonth ? calendar.monthRange.start : calendar.weekStart;
  const rangeEnd = isMonth ? calendar.monthRange.end : addDays(calendar.weekStart, 6);
  const from = format(rangeStart, "yyyy-MM-dd'T'00:00:00");
  const to = format(rangeEnd, "yyyy-MM-dd'T'23:59:59");
  const {
    data: events,
    isPending,
    isError,
    refetch,
  } = useCalendarEvents(from, to);
  const { data: levels } = useCoachLevels();

  // One pass over the week: the strip needs every day's events in start-time
  // order for its dots, and the detail list is just one of those buckets.
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

  const selectedDayKey = format(calendar.selectedDay, "yyyy-MM-dd");
  const dayEvents = eventsByDay[selectedDayKey] ?? [];

  const levelCodeById = React.useMemo(
    () => new Map((levels ?? []).map((l) => [String(l.id), l.code])),
    [levels]
  );

  // "Next" is a property of the whole visible set, not of one card. The gate is
  // the WEEK containing today — the same rule the web view uses.
  const nextEventId = React.useMemo(
    () =>
      (isMonth ? calendar.monthDays : calendar.weekDays).some((d) => isToday(d))
        ? findNextEventId(events ?? [])
        : undefined,
    [events, isMonth, calendar.monthDays, calendar.weekDays]
  );

  const openEvent = (event: CalendarEvent) => {
    // PAD-160: non-class events have their own detail screen, as on web.
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
      <ViewModeControl
        value={calendar.viewMode}
        onChange={calendar.setViewMode}
        enabled={ENABLED_VIEW_MODES}
      />

      {isError ? (
        <View className="flex-1">
          <ErrorState message={t("calendar.mobile.loadFailed")} onRetry={() => refetch()} />
        </View>
      ) : isPending ? (
        <View className="flex-1 gap-3 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </View>
      ) : isMonth ? (
        // PAD-248: Mês — month nav, month grid, single-day grid, day sheet.
        <MonthView
          monthLabel={calendar.monthLabel}
          monthDays={calendar.monthDays}
          monthStart={calendar.monthStart}
          selectedDay={calendar.selectedDay}
          onSelectDay={calendar.selectDay}
          onPrevMonth={() => calendar.navigateMonth("prev")}
          onNextMonth={() => calendar.navigateMonth("next")}
          onSheetRaisedChange={setAddButtonsHidden}
          eventsByDay={eventsByDay}
          nextEventId={nextEventId}
          levelCodeById={levelCodeById}
          onEventPress={openEvent}
        />
      ) : calendar.viewMode === "week" ? (
        // PAD-247: Semana — nav row, day header row, time grid, day sheet.
        <WeekView
          weekDays={calendar.weekDays}
          weekLabel={calendar.weekLabel}
          selectedDay={calendar.selectedDay}
          onSelectDay={calendar.selectDay}
          onPrevWeek={() => calendar.navigateWeek("prev")}
          onNextWeek={() => calendar.navigateWeek("next")}
          onToday={calendar.goToToday}
          events={events ?? []}
          eventsByDay={eventsByDay}
          nextEventId={nextEventId}
          levelCodeById={levelCodeById}
          onEventPress={openEvent}
        />
      ) : (
        <>
          <DayStrip
            weekDays={calendar.weekDays}
            selectedDay={calendar.selectedDay}
            onSelectDay={calendar.selectDay}
            onPrev={() => calendar.navigateWeek("prev")}
            onNext={() => calendar.navigateWeek("next")}
            eventsByDay={eventsByDay}
          />
          <ScrollView
            testID="calendar-day-list"
            className="flex-1"
            // Rule 18: clear of the floating add buttons at the end of the list.
            contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
          >
            <DayHeader day={calendar.selectedDay} count={dayEvents.length} />
            <View className="gap-3 px-5 pt-3">
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
            </View>
          </ScrollView>
        </>
      )}

      {/* Floating add actions (calendar.mobile-views rule 18): "Add event" for
          every role, "Add class" for coaches only. */}
      {!addButtonsHidden ? (
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
      ) : null}

      {isCoach && !addButtonsHidden ? (
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
