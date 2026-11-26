import { Ionicons } from "@expo/vector-icons";
import { keepPreviousData } from "@tanstack/react-query";
import {
  filterStudentEvents,
  findNextEventId,
  isClubToday,
  lightTheme,
  nextClassIdInTodayWeek,
} from "@levelup/config";
import {
  useCalendar,
  useCalendarEvents,
  useCoachLevels,
  useDayList,
  type CalendarViewMode,
} from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";
import { addDays, format } from "date-fns";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { CalendarViewerProvider } from "@/features/calendar/viewer-context";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { DayList } from "@/features/calendar/DayList";
import { DayStrip } from "@/features/calendar/DayStrip";
import { eventToParams } from "@/features/calendar/params";
import {
  StudentCalendarHeader,
  useStudentCalendarFilter,
} from "@/features/calendar/student-calendar-header";
import { ViewModeControl } from "@/features/calendar/ViewModeControl";
import { WeekView } from "@/features/calendar/WeekView";
import { MonthView } from "@/features/calendar/MonthView";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { refetchAll } from "@/lib/pull-refresh";
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
  // PAD-664 (calendar.view rule 23): a student chooses every eligible class or only their own.
  const [studentFilter, setStudentFilter] = useStudentCalendarFilter(user?.id);
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
  // calendar.mobile-views rule 26c: in Dia the list reads its own range (`useDayList`), so this screen's own week
  // read is off while Dia shows, and Semana and Mês only ever get their own weeks.
  const isDay = calendar.viewMode === "day";
  const dayList = useDayList({
    active: isDay,
    selectedDay: calendar.selectedDay,
    selectDay: calendar.selectDay,
  });
  const rangeStart = isMonth ? calendar.monthRange.start : calendar.weekStart;
  const rangeEnd = isMonth ? calendar.monthRange.end : addDays(calendar.weekStart, 6);
  const from = format(rangeStart, "yyyy-MM-dd'T'00:00:00");
  const to = format(rangeEnd, "yyyy-MM-dd'T'23:59:59");
  const {
    data: fetchedEvents,
    isPending,
    isError,
    refetch,
  } = useCalendarEvents(from, to, {
    // PAD-592 (client.query-cache): a week/month change shows the last range until the next
    // answers, instead of a skeleton on every navigation.
    placeholderData: keepPreviousData,
    enabled: !isDay,
  });
  const sourceEvents = isDay ? dayList.events : fetchedEvents;
  const events = React.useMemo(
    () => (sourceEvents && !isCoach ? filterStudentEvents(sourceEvents, studentFilter) : sourceEvents),
    [sourceEvents, isCoach, studentFilter]
  );
  const { data: levels } = useCoachLevels();
  // PAD-786 (client.pull-to-refresh rule 1): the day list only. The week and month grids sit in
  // GridWithSheet, whose bottom sheet owns the vertical drag (rule 2).
  // Dia refetches both of its reads, and says so when either fails (rule 26d).
  const pull = usePullToRefresh(() => refetchAll(isDay ? dayList.refetchAll : refetch));

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

  const levelCodeById = React.useMemo(
    () => new Map((levels ?? []).map((l) => [String(l.id), l.code])),
    [levels]
  );

  // "Next" is a property of the whole visible set, not of one card. The gate is
  // the WEEK containing today — the same rule the web view uses.
  // In Dia (26e) it is searched in the week that holds today only, as Semana does, whatever weeks are loaded.
  const nextEventId = React.useMemo(
    () =>
      isDay
        ? nextClassIdInTodayWeek(events ?? [])
        : (isMonth ? calendar.monthDays : calendar.weekDays).some((d) => isClubToday(d))
          ? findNextEventId(events ?? [])
          : undefined,
    [events, isDay, isMonth, calendar.monthDays, calendar.weekDays]
  );

  // PAD-592: stable, so the memoised TimeGrid skips when the screen re-renders for other reasons.
  const openEvent = React.useCallback((event: CalendarEvent) => {
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
  }, []);

  return (
    // PAD-578: who is looking — the cards read it, never the session.
    <CalendarViewerProvider viewer={isCoach ? "coach" : "student"}>
    <Screen testID="screen-calendar">
      <ViewModeControl
        value={calendar.viewMode}
        onChange={calendar.setViewMode}
        enabled={ENABLED_VIEW_MODES}
      />
      {!isCoach ? <StudentCalendarHeader filter={studentFilter} onChange={setStudentFilter} /> : null}

      {isDay ? (
        <>
          <DayStrip
            weekDays={calendar.weekDays}
            selectedDay={calendar.selectedDay}
            onSelectDay={calendar.selectDay}
            onPrev={() => calendar.navigateWeek("prev")}
            onNext={() => calendar.navigateWeek("next")}
            eventsByDay={eventsByDay}
          />
          <DayList
            list={dayList}
            eventsByDay={eventsByDay}
            nextEventId={nextEventId}
            levelCodeById={levelCodeById}
            onEventPress={openEvent}
            selectedDay={calendar.selectedDay}
            onToday={calendar.goToToday}
            // Centred on the add-event button (coach: 96pt up, 48pt tall; student: 24pt up).
            todayBottom={isCoach ? 98 : 26}
            // Rule 26g: switching the student's filter keeps the selected day at the top.
            filterKey={isCoach ? undefined : studentFilter}
            // PAD-786 (client.pull-to-refresh rule 1): the day list pulls at its top.
            refreshControl={
              <RefreshControl
                testID="calendar-refresh"
                refreshing={pull.refreshing}
                onRefresh={pull.onRefresh}
              />
            }
          />
        </>
      ) : isError ? (
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
      ) : null}

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
    </CalendarViewerProvider>
  );
}
