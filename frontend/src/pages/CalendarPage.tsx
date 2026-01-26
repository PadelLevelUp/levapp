import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CalendarToolbar } from "@/components/calendar/CalendarToolbar";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { ClassDetailSheet } from "@/components/calendar/ClassDetailSheet";
import { AddClassSheet } from "@/components/calendar/AddClassSheet";
import { getCalendarEvents } from "@/api/calendar";
import { getCoachLevels } from "@/api/coachLevel";
import { getCoachPlayers } from "@/api/players";
import { useCalendar } from "@/hooks/useCalendar";
import type { CalendarEvent, CoachLevel, CoachPlayer } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { startOfWeek, addDays, format } from "date-fns";
import { LoadingCalendar } from "@/components/ui/loading-skeleton";
import { Sparkles } from 'lucide-react';

export default function CalendarPage() {
  // REPLACE THIS WITH AUTH 
  const USER_ID = 2;
  const COACH_ID = "1";

  const { toast } = useToast();

  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [levels, setLevels] = useState<CoachLevel[]>([]);
  const [coachPlayers, setCoachPlayers] = useState<CoachPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calendar = useCalendar(allEvents);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const from = format(calendar.weekStart, "yyyy-MM-dd'T'00:00:00");
        const to = format(
          addDays(calendar.weekStart, 6),
          "yyyy-MM-dd'T'23:59:59"
        );

        const data = await getCalendarEvents(from, to, USER_ID);
        setAllEvents(data);

        const [playersData, levelsData] = await Promise.all([
          getCoachPlayers(COACH_ID),
          getCoachLevels(COACH_ID),
        ]);
  
        setLevels(levelsData);
        setCoachPlayers(playersData);

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [calendar.weekStart]);

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

  const handleSaveClass = (data: any) => {
    toast({
      title: "Class created",
      description: `${data.name || "New class"} added to the calendar`,
    });
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
          onAddClass={() => setAddClassOpen(true)}
        />

        <CalendarHeader weekDays={calendar.weekDays} />

        <CalendarGrid
          weekDays={calendar.weekDays}
          events={calendar.events}
          onEventClick={setSelectedEvent}
          onSlotClick={handleSlotClick}
        />
      </div>

      <ClassDetailSheet
        event={selectedEvent}
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      <AddClassSheet
        open={addClassOpen}
        onClose={() => setAddClassOpen(false)}
        initialDate={newClassDate}
        initialTime={newClassTime}
        onSave={handleSaveClass}
        levels={levels}
        players={coachPlayers}
      />
    </AppLayout>
  );
}
