import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { ClassDetailSheet } from "@/components/calendar/ClassDetailSheet";
import { MobileCalendarView } from "@/components/calendar/MobileCalendarView";
import { AddClassSheet } from "@/components/calendar/AddClassSheet";
import { AddEventSheet } from "@/components/calendar/AddEventSheet";
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet";
import { getCalendarEvents, addCalendarBlock, rescheduleCalendarBlock } from "@/api/calendar";
import { getCoachLevels } from "@/api/coachLevel";
import { getCoachPlayers } from "@/api/players";
import { useCalendar } from "@/hooks/useCalendar";
import type { CalendarEvent, ClassInstance, CoachLevel, CoachPlayer } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";
import { LoadingCalendar } from "@/components/ui/loading-skeleton";
import { removeClass, editClass, addClass } from "@/api/classes";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/auth/AuthContext";
import { RescheduleDialog } from "@/components/calendar/RescheduleDialog";
import type { ApplyScope } from "@/components/calendar/ClassScopeDialog";

export default function CalendarPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [levels, setLevels] = useState<CoachLevel[]>([]);
  const [coachPlayers, setCoachPlayers] = useState<CoachPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMobile = useIsMobile();
  
  const canManageClasses = user?.roles.includes("coach") ?? false;
  const calendar = useCalendar(allEvents);

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
      }
    }

    loadEvents();
  }, [calendar.weekStart]);

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
        title: "Class deleted",
        description: event.title,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: "The class could not be deleted.",
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
      participantCount:
        instance.participants !== undefined
          ? instance.participants.length
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
        title: "Class updated",
        description: updated.name || event.title,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Changes could not be saved.",
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
      toast({ title: 'Event rescheduled' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to reschedule event' });
    }
  };

  const handleSaveEvent = async (data: any) => {
    try {
      await addCalendarBlock(data);
      await refreshEvents();
      toast({ title: "Event created" });
    } catch {
      toast({ variant: "destructive", title: "Failed to create event" });
    }
  };

  const handleSaveClass = async (data: any) => {
    setAddingClass(true);

    try {
      const created = await addClass(data);

      setAllEvents(prev => [...prev, created]);

      toast({
        title: "Class created",
        description: created.name || "New class",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Creation failed",
        description: "The class could not be created.",
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
