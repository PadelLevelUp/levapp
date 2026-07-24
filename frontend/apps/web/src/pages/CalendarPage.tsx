import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { ClassDetailSheet } from "@/components/calendar/ClassDetailSheet";
import { MobileCalendarView } from "@/components/calendar/MobileCalendarView";
import {
  AddClassSheet,
  AddClassRejected,
  NO_SEASON_COVERS_DATE,
} from "@/components/calendar/AddClassSheet";
import { AddEventSheet } from "@/components/calendar/AddEventSheet";
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet";
import { effectiveFilledSpots } from "@levelup/config";
import { getCalendarEvents, addCalendarBlock, rescheduleCalendarBlock } from "@/api/calendar";
import { getCoachLevels } from "@/api/coachLevel";
import { getCoachPlayers } from "@/api/players";
import { useCalendar } from "@/hooks/useCalendar";
import type { CalendarEvent, ClassInstance, CoachLevel, CoachPlayer } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { addDays, format, isValid, parseISO } from "date-fns";
import { LoadingCalendar } from "@/components/ui/loading-skeleton";
import { removeClass, editClass, addClass } from "@/api/classes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/auth/AuthContext";
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
  };
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Frozen at first render: the calendar must open on the deep-linked week straight
  // away, so the very first events fetch already targets the right range.
  const [deepLink] = useState(() => readDeepLink(window.location.search));
  const [pendingClassId, setPendingClassId] = useState<string | null>(
    deepLink.classId
  );

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoadedOnce, setEventsLoadedOnce] = useState(false);
  const [levels, setLevels] = useState<CoachLevel[]>([]);
  const [coachPlayers, setCoachPlayers] = useState<CoachPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const canManageClasses = user?.roles.includes("coach") ?? false;
  const calendar = useCalendar(allEvents, {
    initialDate: deepLink.date ?? undefined,
  });

  useEffect(() => {
    async function loadEvents() {
      setLoading(true);
      try {
        const from = format(calendar.weekStart, "yyyy-MM-dd'T'00:00:00");
        const to = format(addDays(calendar.weekStart, 6), "yyyy-MM-dd'T'23:59:59");

        const data = await getCalendarEvents(from, to);
        setAllEvents(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
        setEventsLoadedOnce(true);
      }
    }

    loadEvents();
  }, [calendar.weekStart]);

  // Consume the deep-link params once, with a history replace, so closing the sheet
  // (or navigating back) never re-opens it.
  useEffect(() => {
    if (!searchParams.has("classId") && !searchParams.has("date")) return;

    const next = new URLSearchParams(searchParams);
    next.delete("classId");
    next.delete("date");
    setSearchParams(next, { replace: true });
    // Runs once — the guard above makes it a no-op afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadPopupData() {
      if (!canManageClasses) {
        setCoachPlayers([]);
        setLevels([]);
        return;
      }

      try {
        const [playersData, levelsData] = await Promise.all([
          getCoachPlayers(),
          getCoachLevels(),
        ]);

        setCoachPlayers(playersData);
        setLevels(levelsData);
      } catch (err) {
        console.error("Failed loading popup data", err);
      }
    }

    loadPopupData();
  }, [canManageClasses]);

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
    if (match) handleEventClick(match);

    setPendingClassId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClassId, eventsLoadedOnce, allEvents]);

  const [newClassDate, setNewClassDate] = useState<Date>();
  const [newClassTime, setNewClassTime] = useState<string>();
  const [mobileSelectedDay, setMobileSelectedDay] = useState<Date>();

  const handleSlotClick = (date: Date, time: string) => {
    setNewClassDate(date);
    setNewClassTime(time);
    setAddClassOpen(true);
  };

  const handleDeleteClass = async (
    event: CalendarEvent,
    scope: "single" | "future"
  ) => {
    setDeletingClassId(event.id);

    try {
      await removeClass(event, scope);

      setAllEvents(prev => prev.filter(e => e.id !== event.id));
      setSelectedClassEvent(null);

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

      setAllEvents(prev =>
        prev.map(e =>
          e.id === event.id
            ? instanceToCalendarEvent(updated, e)
            : e
        )
      );
      setSelectedClassEvent(null);

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


  const refreshEvents = async () => {
    const from = format(calendar.weekStart, "yyyy-MM-dd'T'00:00:00");
    const to = format(addDays(calendar.weekStart, 6), "yyyy-MM-dd'T'23:59:59");
    setAllEvents(await getCalendarEvents(from, to));
  };

  const handleEventDrop = (event: CalendarEvent, newDate: string, newStartTime: string) => {
    const [sh, sm] = event.startTime.split(':').map(Number);
    const [eh, em] = event.endTime.split(':').map(Number);
    const durationMin = (eh * 60 + em) - (sh * 60 + sm);
    const [nh, nm] = newStartTime.split(':').map(Number);
    const endTotal = nh * 60 + nm + durationMin;
    const newEndTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;

    if (newDate === event.date && newStartTime === event.startTime) return;

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
    } catch {
      toast({ variant: 'destructive', title: t('calendar.page.failedReschedule') });
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

      setAllEvents(prev => [...prev, created]);

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
      <div className="flex flex-col h-full">
        <CalendarToolbar
          weekLabel={calendar.weekLabel}
          onPrevWeek={() => calendar.navigateWeek("prev")}
          onNextWeek={() => calendar.navigateWeek("next")}
          onToday={calendar.goToToday}
          onAddEvent={() => setAddEventOpen(true)}
          onAddClass={canManageClasses ? () => {
            setNewClassDate(isMobile && mobileSelectedDay ? mobileSelectedDay : new Date());
            setNewClassTime(undefined);
            setAddClassOpen(true);
          } : undefined}
        />

        {isMobile ? (
          <MobileCalendarView
            weekDays={calendar.weekDays}
            events={calendar.events}
            onEventClick={handleEventClick}
            onDaySelect={setMobileSelectedDay}
          />
        ) : (
          <>
            <CalendarHeader weekDays={calendar.weekDays} />
            <CalendarGrid
              weekDays={calendar.weekDays}
              events={calendar.events}
              onEventClick={handleEventClick}
              onSlotClick={canManageClasses ? handleSlotClick : undefined}
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
        onClose={() => setSelectedClassEvent(null)}
        canManage={canManageClasses}
        onDelete={canManageClasses ? handleDeleteClass : undefined}
        onEdit={canManageClasses ? handleEditClass : undefined}
        deleting={deletingClassId === selectedClassEvent?.id}
        saving={editingClassId === selectedClassEvent?.id}
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
        onDeleted={(event) => setAllEvents(prev => prev.filter(e => e.id !== event.id))}
      />

      <AddEventSheet
        open={addEventOpen}
        onClose={() => setAddEventOpen(false)}
        onSave={handleSaveEvent}
      />

      {canManageClasses && (
        <AddClassSheet
          open={addClassOpen}
          onClose={() => setAddClassOpen(false)}
          initialDate={newClassDate}
          initialTime={newClassTime}
          onSave={handleSaveClass}
          levels={levels}
          players={coachPlayers}
          loading={addingClass}
        />
      )}
    </AppLayout>
  );
}
