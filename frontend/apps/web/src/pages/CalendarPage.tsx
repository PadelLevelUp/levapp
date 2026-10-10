import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { ClassDetailSheet } from "@/components/calendar/ClassDetailSheet";
import {
  ENABLED_VIEW_MODES,
  MobileCalendar,
} from "@/components/calendar/mobile/MobileCalendar";
import {
  isRequestEvent,
  queryKeys,
  useCalendarEvents,
  useCoachLevels,
  useCoachRoster,
  type CalendarViewMode,
} from "@levelup/hooks";
import { CalendarPlus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AddClassSheet,
  AddClassRejected,
  NO_SEASON_COVERS_DATE,
} from "@/components/calendar/AddClassSheet";
import { AddEventSheet } from "@/components/calendar/AddEventSheet";
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet";
import { effectiveFilledSpots, isHoldOccurrenceLocked } from "@levelup/config";
import { addCalendarBlock, rescheduleCalendarBlock } from "@/api/calendar";
import { useCalendar } from "@/hooks/useCalendar";
import type { CalendarEvent, ClassInstance, CoachLevel, CoachPlayer } from "@/types";
import type { CloneTemplate } from "@levelup/types";
import * as classesApi from "@levelup/api/src/resources/classes";
import { useToast } from "@/hooks/use-toast";
import { addDays, endOfDay, format, isValid, isWithinInterval, parseISO } from "date-fns";
import { LoadingCalendar } from "@/components/ui/loading-skeleton";
import { removeClass, editClass, addClass } from "@/api/classes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/auth/AuthContext";
import { subscribeAppEvents } from "@/api/events";
import { RescheduleDialog } from "@/components/calendar/RescheduleDialog";
import type { ApplyScope } from "@/components/calendar/ClassScopeDialog";

/**
 * Reads the `/calendar?classId=…&date=YYYY-MM-DD` deep link (dashboard.navigation rule 8).
 * An unparseable or missing `date` is ignored rather than treated as an error.
 */
function readDeepLink(search: string) {
  const params = new URLSearchParams(search);
  const rawDate = params.get("date");
  const parsedDate = rawDate ? parseISO(rawDate) : null;

  return {
    classId: params.get("classId"),
    date: parsedDate && isValid(parsedDate) ? parsedDate : null,
    // PAD-285 (dashboard.blocks rule 10): "Convidar" opens the class with Notificar open.
    notify: params.get("notify") === "1",
    // PAD-520 (dashboard.navigation rule 12): the dashboard's "Nova aula" opens the new-class sheet.
    newClass: params.get("new") === "1",
  };
}

/**
 * PAD-246 (calendar.mobile-views rule 1): the phone view mode is remembered
 * on the device. A stored mode that has not shipped yet falls back to Dia, so
 * a value written by a newer build never strands an older one.
 */
const VIEW_MODE_STORAGE_KEY = "levapp.calendar.viewMode";

function readStoredViewMode(): CalendarViewMode {
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored && ENABLED_VIEW_MODES.includes(stored as CalendarViewMode)) {
      return stored as CalendarViewMode;
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return "day";
}

function writeStoredViewMode(mode: CalendarViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Best effort — the mode still applies for this session.
  }
}

// Stable empty results, so `useCalendar` and the sheets never see a new array on every render.
const NO_EVENTS: CalendarEvent[] = [];
const NO_PLAYERS: CoachPlayer[] = [];
const NO_LEVELS: CoachLevel[] = [];

export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Frozen at first render: the calendar must open on the deep-linked week straight
  // away, so the very first events fetch already targets the right range.
  const [deepLink] = useState(() => readDeepLink(window.location.search));
  // PAD-285: `&notify=1` on the deep link opens the sheet with Notificar open.
  const [notifyOnOpen, setNotifyOnOpen] = useState(false);
  const [pendingClassId, setPendingClassId] = useState<string | null>(
    deepLink.classId
  );

  const isMobile = useIsMobile();
  // PAD-248 rule 18: in Mês the add buttons step aside while the day sheet is pulled up.
  const [addButtonsHidden, setAddButtonsHidden] = useState(false);

  const canManageClasses = user?.roles.includes("coach") ?? false;

  // client.query-cache: the range, the roster and the levels are queries (rules 6-7). The roster and
  // levels share one key with presences / player detail / the class sheets, so moving between
  // those screens inside the stale window makes no request for them.
  const rosterQuery = useCoachRoster({ enabled: canManageClasses });
  const levelsQuery = useCoachLevels({ enabled: canManageClasses });
  const coachPlayers = canManageClasses ? (rosterQuery.data ?? NO_PLAYERS) : NO_PLAYERS;
  const levels = canManageClasses ? (levelsQuery.data ?? NO_LEVELS) : NO_LEVELS;

  // `useCalendar` owns the week and view-mode state, and the range it yields is what the events
  // query is keyed on; so the hook is given no events and the page filters the query's data
  // by the same week / month intervals below (the hook's own `events` / `monthEvents`).
  const calendar = useCalendar(NO_EVENTS, {
    initialDate: deepLink.date ?? undefined,
    // PAD-181: the week-range label follows the active UI language. Passing
    // `i18n.language` (rather than the hook reading a module-level instance)
    // keeps `@levelup/hooks` platform-neutral and re-renders the label when the
    // coach switches language.
    language: i18n.language,
    initialViewMode: readStoredViewMode(),
    onViewModeChange: writeStoredViewMode,
  });

  // PAD-248: in Mês the phone fetches every week the month grid touches;
  // otherwise (and always on desktop) the visible week. Both the initial load
  // and refreshEvents use this range, so a save in Mês keeps the dots.
  const fetchMonth = isMobile && calendar.viewMode === "month";
  const fetchFrom = format(
    fetchMonth ? calendar.monthRange.start : calendar.weekStart,
    "yyyy-MM-dd'T'00:00:00"
  );
  const fetchTo = format(
    fetchMonth ? calendar.monthRange.end : addDays(calendar.weekStart, 6),
    "yyyy-MM-dd'T'23:59:59"
  );

  // client.query-cache rule 5: a range change keeps the previous range on screen until the next one
  // arrives (`placeholderData: keepPreviousData`), so the grid never goes empty between weeks.
  const eventsQuery = useCalendarEvents(fetchFrom, fetchTo, {
    placeholderData: keepPreviousData,
  });
  const allEvents = eventsQuery.data ?? NO_EVENTS;
  const loading = eventsQuery.isPending;
  const eventsLoadedOnce = !eventsQuery.isPending;
  // Rule 5 on the desktop grid: while the next week is in flight the data on hand is the previous
  // week's, so the grid keeps showing THAT week (its columns and its cards) under the new week's
  // toolbar label, and swaps when the response lands. The phone views are day-based and follow
  // the selected day, so they use the new week at once.
  // Rule 5: the header and columns follow the cards on screen, not the requested week, while the
  // next range is a placeholder; the render-time write is idempotent.
  const displayedWeekStart = useRef(calendar.weekStart);
  if (!eventsQuery.isPlaceholderData) displayedWeekStart.current = calendar.weekStart;
  const gridWeekStart = isMobile ? calendar.weekStart : displayedWeekStart.current;
  const gridWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(gridWeekStart, i)),
    [gridWeekStart]
  );
  const weekEvents = useMemo(
    () =>
      allEvents.filter((e) =>
        isWithinInterval(parseISO(e.date), {
          start: gridWeekStart,
          end: addDays(gridWeekStart, 6),
        })
      ),
    [allEvents, gridWeekStart]
  );
  const monthEvents = useMemo(
    () =>
      allEvents.filter((e) =>
        isWithinInterval(parseISO(e.date), {
          start: calendar.monthRange.start,
          end: endOfDay(calendar.monthRange.end),
        })
      ),
    [allEvents, calendar.monthRange]
  );

  // Every read of the calendar is the `calendar-events` prefix: every cached range goes stale and
  // the one on screen refetches. A failed re-read keeps what is on screen.
  const refreshEvents = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
    [queryClient]
  );

  // calendar.view rule 18 (PAD-526, B-344): after a class write, re-read the range on screen. The
  // local patch shows the clicked card at once; this brings the occurrences only the server knows.
  const refreshAfterClassWrite = useCallback(() => {
    void refreshEvents();
  }, [refreshEvents]);

  // A local edit (add, delete, drop) patches the cached range and retires any read in flight: that
  // answer was taken before the edit and would otherwise erase it when it lands. The patch is
  // applied once the cancel has settled, because a cancel restores the pre-fetch state.
  const editEvents = useCallback(
    (update: (prev: CalendarEvent[]) => CalendarEvent[]) => {
      const key = queryKeys.calendarEvents(fetchFrom, fetchTo);
      // A failed cancel falls back to a refetch rather than dropping the local edit.
      queryClient
        .cancelQueries({ queryKey: key })
        .then(() =>
          queryClient.setQueryData<CalendarEvent[]>(key, (old) => update(old ?? NO_EVENTS))
        )
        .catch(() => refreshEvents());
    },
    [queryClient, fetchFrom, fetchTo, refreshEvents]
  );

  // classes.class-requests rule 19 (PAD-488, B-264): a request changed on this device, the
  // other person's or another of mine — the hold moved or went and a class may have taken its
  // place, so the calendar's cached ranges are invalidated (R-014: an event, never a poll).
  useEffect(() => {
    if (!token) return;
    return subscribeAppEvents(token, (data) => {
      if (isRequestEvent(data.type)) void refreshEvents();
    });
  }, [token, refreshEvents]);

  // Consume the deep-link params once, with a history replace, so closing the sheet
  // (or navigating back) never re-opens it.
  useEffect(() => {
    if (!searchParams.has("classId") && !searchParams.has("date") && !searchParams.has("new")) return;

    const next = new URLSearchParams(searchParams);
    next.delete("classId");
    next.delete("notify");
    next.delete("date");
    next.delete("new");
    setSearchParams(next, { replace: true });
    // Runs once — the guard above makes it a no-op afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedClassEvent, setSelectedClassEvent] =
    useState<CalendarEvent | null>(null);
  const [selectedBlockEvent, setSelectedBlockEvent] =
    useState<CalendarEvent | null>(null);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);

  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [addingClass, setAddingClass] = useState(false);

  const [pendingDrop, setPendingDrop] = useState<{
    event: CalendarEvent;
    newDate: string;
    newStartTime: string;
    newEndTime: string;
  } | null>(null);

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === "block") {
      setSelectedBlockEvent(event);
    } else {
      setSelectedClassEvent(event);
    }
  };

  // Deep link: once the (already correct) week's events have loaded, open the detail
  // sheet for the requested occurrence. A `classId` that matches nothing is a silent
  // no-op — the coach still lands on the right week. Either way this fires only once.
  useEffect(() => {
    if (!pendingClassId || !eventsLoadedOnce) return;

    const match = allEvents.find((e) => e.id === pendingClassId);
    if (match) {
      setNotifyOnOpen(deepLink.notify);
      handleEventClick(match);
    }

    setPendingClassId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClassId, eventsLoadedOnce, allEvents]);

  const [newClassDate, setNewClassDate] = useState<Date>();
  const [newClassTime, setNewClassTime] = useState<string>();
  const [newClassEndTime, setNewClassEndTime] = useState<string>();

  // On a phone the new class lands on the selected day (calendar.slot-click's
  // date prefill); on desktop the toolbar button opens on today.
  // classes.clone (PAD-524): "Clonar aula" — the server derives the prefill; the ordinary
  // new-class sheet opens with it, and its save is the ordinary create.
  const [cloneTemplate, setCloneTemplate] = useState<CloneTemplate | null>(null);
  const handleCloneClass = async (event: CalendarEvent) => {
    try {
      const template = await classesApi.getCloneTemplate({
        model: event.model as string,
        originalId: event.originalId as string | number,
        date: event.date,
      });
      setSelectedClassEvent(null);
      setCloneTemplate(template);
      setAddClassOpen(true);
    } catch {
      toast({ variant: "destructive", title: t("calendar.detail.cloneFailed") });
    }
  };

  const openAddClass = () => {
    setCloneTemplate(null);
    setNewClassDate(isMobile ? calendar.selectedDay : new Date());
    setNewClassTime(undefined);
    setNewClassEndTime(undefined);
    setAddClassOpen(true);
  };

  // PAD-520 (dashboard.navigation rule 12, B-345): `?new=1` — the dashboard's "Nova aula" — opens
  // the new-class sheet once, for a coach, exactly as the toolbar's own button does. Before, the
  // page never read the param and the coach landed on the calendar with nothing open.
  const newClassFromLink = useRef(deepLink.newClass);
  useEffect(() => {
    if (!newClassFromLink.current || !canManageClasses) return;
    newClassFromLink.current = false;
    openAddClass();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageClasses]);

  const handleSlotClick = (date: Date, time: string) => {
    setNewClassDate(date);
    setNewClassTime(time);
    // No end time: a single slot keeps the sheet's own default duration.
    setNewClassEndTime(undefined);
    setAddClassOpen(true);
  };

  // PAD-106: a drag across two or more slots opens the same sheet, but also
  // pins the end time to the dragged range.
  const handleSlotRangeSelect = (date: Date, startTime: string, endTime: string) => {
    setNewClassDate(date);
    setNewClassTime(startTime);
    setNewClassEndTime(endTime);
    setAddClassOpen(true);
  };

  const handleDeleteClass = async (
    event: CalendarEvent,
    scope: "single" | "future"
  ) => {
    setDeletingClassId(event.id);

    try {
      await removeClass(event, scope);

      editEvents(prev => prev.filter(e => e.id !== event.id));
      setSelectedClassEvent(null);
      // calendar.view rule 18 (PAD-526, B-344): a "this and future" delete removes later cards too.
      refreshAfterClassWrite();

      toast({
        title: t("calendar.page.classDeleted"),
        description: event.title,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("calendar.page.deleteFailed"),
        description: t("calendar.page.deleteFailedDescription"),
      });
    } finally {
      setDeletingClassId(null);
    }
  };

  function instanceToCalendarEvent(
    instance: Partial<ClassInstance>,
    prev: CalendarEvent
  ): CalendarEvent {
    return {
      ...prev,

      title:
        instance.name !== undefined ? instance.name : prev.title,
      date:
        instance.date !== undefined ? instance.date : prev.date,
      startTime:
        instance.startTime !== undefined ? instance.startTime : prev.startTime,
      endTime:
        instance.endTime !== undefined ? instance.endTime : prev.endTime,
      color:
        instance.color !== undefined ? instance.color : prev.color,
      maxPlayers:
        instance.maxPlayers !== undefined
          ? instance.maxPlayers
          : prev.maxPlayers,
      // PAD-71: the badge shows EFFECTIVE filled spots (enrolled minus
      // declined), matching the backend payload and the detail sheet's
      // capacity field — never the raw enrolment count.
      participantCount:
        instance.participants !== undefined
          ? effectiveFilledSpots(instance.participants.length, instance.presences)
          : prev.participantCount,
    };
  }

  const handleEditClass = async (
    event: CalendarEvent,
    updated: any,
    scope: "single" | "future"
  ) => {
    setEditingClassId(event.id);

    try {
      await editClass(event, updated, scope);

      editEvents(prev =>
        prev.map(e =>
          e.id === event.id
            ? instanceToCalendarEvent(updated, e)
            : e
        )
      );
      setSelectedClassEvent(null);
      // calendar.view rule 18 (PAD-526, B-344): the clicked card is patched at once; the re-read
      // brings every other occurrence the edit reached (a "this and future" edit, a moved series).
      refreshAfterClassWrite();

      toast({
        title: t("calendar.page.classUpdated"),
        description: updated.name || event.title,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("calendar.page.updateFailed"),
        description: t("calendar.page.updateFailedDescription"),
      });
    } finally {
      setEditingClassId(null);
    }
  };


  const handleEventDrop = (event: CalendarEvent, newDate: string, newStartTime: string) => {
    const [sh, sm] = event.startTime.split(':').map(Number);
    const [eh, em] = event.endTime.split(':').map(Number);
    const durationMin = (eh * 60 + em) - (sh * 60 + sm);
    const [nh, nm] = newStartTime.split(':').map(Number);
    const endTotal = nh * 60 + nm + durationMin;
    const newEndTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;

    if (newDate === event.date && newStartTime === event.startTime) return;

    // PAD-372: the card of a live class-request hold is not draggable, but a feed loaded
    // before the request was made still is — say why instead of opening the scope dialog.
    if (event.type === 'block' && event.requestHoldOf) {
      toast({ variant: 'destructive', title: t('calendar.page.holdOccurrenceLocked') });
      return;
    }

    setPendingDrop({ event, newDate, newStartTime, newEndTime });
  };

  const handleRescheduleConfirm = async (scope: ApplyScope) => {
    if (!pendingDrop) return;
    const { event, newDate, newStartTime, newEndTime } = pendingDrop;
    setPendingDrop(null);

    try {
      if (event.type === 'block') {
        await rescheduleCalendarBlock(event.originalId as number, {
          occDate: event.date,
          newDate,
          newStartTime,
          newEndTime,
          scope,
        });
      } else {
        await editClass(event, { date: newDate, startTime: newStartTime, endTime: newEndTime }, scope);
      }
      await refreshEvents();
      toast({ title: t('calendar.page.eventRescheduled') });
    } catch (err) {
      // PAD-372: 409 HOLD_OCCURRENCE_LOCKED — the card never moved (this drop is not
      // optimistic), so only the reason is owed.
      toast({
        variant: 'destructive',
        title: t(isHoldOccurrenceLocked(err) ? 'calendar.page.holdOccurrenceLocked' : 'calendar.page.failedReschedule'),
      });
    }
  };

  const handleSaveEvent = async (data: any) => {
    try {
      await addCalendarBlock(data);
      await refreshEvents();
      toast({ title: t("calendar.page.eventCreated") });
    } catch {
      toast({ variant: "destructive", title: t("calendar.page.failedCreateEvent") });
    }
  };

  const handleSaveClass = async (data: any) => {
    setAddingClass(true);

    try {
      const created = await addClass(data);

      editEvents(prev => [...prev, created]);
      // calendar.view rule 18 (PAD-526, B-344): a recurring class has more occurrences on screen.
      refreshAfterClassWrite();

      toast({
        title: t("calendar.page.classCreated"),
        description: created.name || t("calendar.page.newClass"),
      });
    } catch (err) {
      // PAD-90: a rejection the coach can fix in the form itself (currently only
      // "recurs until season end" with no covering season) is handed back to
      // AddClassSheet, which stays open and explains it next to the toggle. A
      // toast would be wrong here: it disappears and the sheet has already gone.
      const code = (err as { response?: { data?: { code?: string } } })?.response
        ?.data?.code;
      if (code === NO_SEASON_COVERS_DATE) {
        throw new AddClassRejected(code);
      }

      toast({
        variant: "destructive",
        title: t("calendar.page.creationFailed"),
        description: t("calendar.page.creationFailedDescription"),
      });
    } finally {
      setAddingClass(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="relative h-full">
          <LoadingCalendar />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div
        className={cn("flex flex-col h-full transition-opacity", eventsQuery.isPlaceholderData && "opacity-80")}
      >
        {/* PAD-246 (calendar.mobile-views rules 9, 18, 21): the toolbar — and
            the legend inside it — is desktop-only. On a phone the add actions
            are floating buttons, as on iOS. */}
        {!isMobile && (
          <CalendarToolbar
            weekLabel={calendar.weekLabel}
            onPrevWeek={() => calendar.navigateWeek("prev")}
            onNextWeek={() => calendar.navigateWeek("next")}
            onToday={calendar.goToToday}
            onAddEvent={() => setAddEventOpen(true)}
            onAddClass={canManageClasses ? openAddClass : undefined}
          />
        )}

        {isMobile ? (
          <>
            <MobileCalendar
              viewMode={calendar.viewMode}
              onViewModeChange={calendar.setViewMode}
              weekDays={calendar.weekDays}
              selectedDay={calendar.selectedDay}
              onSelectDay={calendar.selectDay}
              onPrevWeek={() => calendar.navigateWeek("prev")}
              onNextWeek={() => calendar.navigateWeek("next")}
              onToday={calendar.goToToday}
              weekLabel={calendar.weekLabel}
              monthLabel={calendar.monthLabel}
              monthDays={calendar.monthDays}
              monthStart={calendar.monthStart}
              onPrevMonth={() => calendar.navigateMonth("prev")}
              onNextMonth={() => calendar.navigateMonth("next")}
              events={weekEvents}
              monthEvents={monthEvents}
              onAddButtonsHiddenChange={setAddButtonsHidden}
              levels={levels}
              onEventClick={handleEventClick}
            />
            {!addButtonsHidden && (
            <button
              type="button"
              data-testid="calendar-add-event"
              aria-label={t("calendar.toolbar.addEvent")}
              onClick={() => setAddEventOpen(true)}
              className={cn(
                "fixed right-6 z-40 grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition-all hover:brightness-95",
                canManageClasses ? "bottom-40" : "bottom-[5.5rem]"
              )}
            >
              <CalendarPlus className="h-5 w-5" />
            </button>
            )}
            {canManageClasses && !addButtonsHidden && (
              <button
                type="button"
                data-testid="calendar-add-class"
                aria-label={t("calendar.toolbar.addClass")}
                onClick={openAddClass}
                className="fixed bottom-[5.5rem] right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:brightness-95"
              >
                <Plus className="h-7 w-7" />
              </button>
            )}
          </>
        ) : (
          <>
            <CalendarHeader weekDays={gridWeekDays} />
            <CalendarGrid
              weekDays={gridWeekDays}
              events={weekEvents}
              levels={levels}
              onEventClick={handleEventClick}
              onSlotClick={canManageClasses ? handleSlotClick : undefined}
              onSlotRangeSelect={canManageClasses ? handleSlotRangeSelect : undefined}
              onEventDrop={handleEventDrop}
            />
          </>
        )}
      </div>

      <ClassDetailSheet
        event={selectedClassEvent}
        open={!!selectedClassEvent}
        players={coachPlayers}
        levels={levels}
        onClose={() => {
          setSelectedClassEvent(null);
          setNotifyOnOpen(false);
        }}
        openNotify={notifyOnOpen}
        canManage={canManageClasses}
        onDelete={canManageClasses ? handleDeleteClass : undefined}
        onEdit={canManageClasses ? handleEditClass : undefined}
        onClone={canManageClasses ? handleCloneClass : undefined}
        deleting={deletingClassId === selectedClassEvent?.id}
        saving={editingClassId === selectedClassEvent?.id}
        existingEvents={allEvents}
      />

      <RescheduleDialog
        open={!!pendingDrop}
        event={pendingDrop?.event ?? null}
        newDate={pendingDrop?.newDate ?? ''}
        newStartTime={pendingDrop?.newStartTime ?? ''}
        newEndTime={pendingDrop?.newEndTime ?? ''}
        onClose={() => setPendingDrop(null)}
        onConfirm={handleRescheduleConfirm}
      />

      <EventDetailSheet
        event={selectedBlockEvent}
        open={!!selectedBlockEvent}
        onClose={() => setSelectedBlockEvent(null)}
        onSaved={refreshEvents}
        onDeleted={(event) => editEvents(prev => prev.filter(e => e.id !== event.id))}
      />

      <AddEventSheet
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSave={handleSaveEvent}
      />

      {canManageClasses && (
        <AddClassSheet
          open={addClassOpen}
          onClose={() => {
            setAddClassOpen(false);
            setCloneTemplate(null);
          }}
          clone={cloneTemplate}
          initialDate={newClassDate}
          initialTime={newClassTime}
          initialEndTime={newClassEndTime}
          onSave={handleSaveClass}
          levels={levels}
          players={coachPlayers}
          loading={addingClass}
          existingEvents={allEvents}
        />
      )}
    </AppLayout>
  );
}
