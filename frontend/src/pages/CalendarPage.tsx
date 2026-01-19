import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { CalendarToolbar } from '@/components/calendar/CalendarToolbar';
import { CalendarHeader } from '@/components/calendar/CalendarHeader';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { ClassDetailSheet } from '@/components/calendar/ClassDetailSheet';
import { AddClassSheet } from '@/components/calendar/AddClassSheet';
import { useCalendar } from '@/hooks/useCalendar';
import { mockClassInstances, mockCalendarBlocks } from '@/data/mockData';
import { CalendarEvent } from '@/types';
import { useToast } from '@/hooks/use-toast';

export default function CalendarPage() {
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [addClassOpen, setAddClassOpen] = useState(false);
  const [newClassDate, setNewClassDate] = useState<Date>();
  const [newClassTime, setNewClassTime] = useState<string>();

  const calendar = useCalendar(mockClassInstances, mockCalendarBlocks);

  const handleSlotClick = (date: Date, time: string) => {
    setNewClassDate(date);
    setNewClassTime(time);
    setAddClassOpen(true);
  };

  const handleSaveClass = (data: any) => {
    toast({ title: 'Clase creada', description: `${data.name || 'Nueva clase'} añadida al calendario` });
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <CalendarToolbar
          weekLabel={calendar.weekLabel}
          onPrevWeek={() => calendar.navigateWeek('prev')}
          onNextWeek={() => calendar.navigateWeek('next')}
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
      />
    </AppLayout>
  );
}
