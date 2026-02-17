import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { ClassDetailSheet } from "@/components/calendar/ClassDetailSheet";
import { MobileCalendarView } from "@/components/calendar/MobileCalendarView";
import { AddClassSheet } from "@/components/calendar/AddClassSheet";
import { getCalendarEvents } from "@/api/calendar";
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

  const [selectedEvent, setSelectedEvent] =
    useState<CalendarEvent | null>(null);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [newClassDate, setNewClassDate] = useState<Date>();
  const [newClassTime, setNewClassTime] = useState<string>();

  const handleSlotClick = (date: Date, time: string) => {
    setNewClassDate(date);
    setNewClassTime(time);
    setAddClassOpen(true);
  };

  const handleDeleteClass = async (
    event: CalendarEvent,
    scope: "single" | "future"
  ) => {
    // Optimistic UI update
    setAllEvents(prev =>
      prev.filter(e => e.id !== event.id)
    );

    setSelectedEvent(null);

    toast({
      title: "Deleting class…",
      description: event.title,
    });

    try {
      await removeClass(event, scope);

      toast({
        title: "Class deleted",
        description: event.title,
      });
    } catch (err) {
      // Rollback
      setAllEvents(prev => [...prev, event]);

      toast({
        variant: "destructive",
        title: "Delete failed",
        description: "The class could not be deleted.",
      });
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
    // Optimistic update
    setAllEvents(prev =>
      prev.map(e =>
        e.id === event.id
          ? instanceToCalendarEvent(updated, e)
          : e
      )
    );

    setSelectedEvent(null);

    toast({
      title: "Saving changes…",
      description: updated.name || event.title,
    });

    try {
      await editClass(event, updated, scope);

      toast({
        title: "Class updated",
        description: updated.name || event.title,
      });
    } catch (err) {
      // Rollback
      setAllEvents(prev =>
        prev.map(e =>
          e.id === event.id ? event : e
        )
      );

      toast({
        variant: "destructive",
        title: "Update failed",
        description: "Changes could not be saved.",
      });
    }
  };


  const handleSaveClass = async (data: any) => {
    // Temporary optimistic event
    const tempEvent: CalendarEvent = {
      ...data,
      id: `temp-${Date.now()}`,
      isTemporary: true,
    };

    setAllEvents(prev => [...prev, tempEvent]);

    toast({
      title: "Creating class…",
      description: data.name || "New class",
    });

    try {
      const created = await addClass(data);

      // Replace temp event with real one
      setAllEvents(prev =>
        prev.map(e =>
          e.id === tempEvent.id ? created : e
        )
      );

      toast({
        title: "Class created",
        description: created.name || "New class",
      });
    } catch (err) {
      // Rollback
      setAllEvents(prev =>
        prev.filter(e => e.id !== tempEvent.id)
      );

      toast({
        variant: "destructive",
        title: "Creation failed",
        description: "The class could not be created.",
      });
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
          onAddClass={canManageClasses ? () => setAddClassOpen(true) : undefined}
        />

        {isMobile ? (
          <MobileCalendarView
            weekDays={calendar.weekDays}
            events={calendar.events}
            onEventClick={setSelectedEvent}
          />
        ) : (
          <>
            <CalendarHeader weekDays={calendar.weekDays} />
            <CalendarGrid
              weekDays={calendar.weekDays}
              events={calendar.events}
              onEventClick={setSelectedEvent}
              onSlotClick={canManageClasses ? handleSlotClick : undefined}
            />
          </>
        )}
      </div>

      <ClassDetailSheet
        event={selectedEvent}
        open={!!selectedEvent}
        players={coachPlayers}
        levels={levels}
        onClose={() => setSelectedEvent(null)}
        canManage={canManageClasses}
        onDelete={canManageClasses ? handleDeleteClass : undefined}
        onEdit={canManageClasses ? handleEditClass : undefined}
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
        />
      )}
    </AppLayout>
  );
}
