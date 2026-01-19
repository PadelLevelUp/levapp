import { useState, useMemo, useCallback } from 'react';
import { addWeeks, subWeeks, startOfWeek, addDays, format, parseISO, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarEvent, ClassInstance, CalendarBlock } from '@/types';

interface UseCalendarOptions {
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function useCalendar(
  classInstances: ClassInstance[],
  calendarBlocks: CalendarBlock[],
  options: UseCalendarOptions = {}
) {
  const { weekStartsOn = 1 } = options; // Default to Monday
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = useMemo(() => 
    startOfWeek(currentDate, { weekStartsOn }),
    [currentDate, weekStartsOn]
  );

  const weekDays = useMemo(() => 
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const weekRange = useMemo(() => ({
    start: weekStart,
    end: addDays(weekStart, 6),
  }), [weekStart]);

  const events = useMemo((): CalendarEvent[] => {
    const classEvents: CalendarEvent[] = classInstances
      .filter(instance => {
        const instanceDate = parseISO(instance.date);
        return isWithinInterval(instanceDate, weekRange);
      })
      .map(instance => ({
        id: instance.id,
        type: 'class' as const,
        title: instance.name || 'Sin nombre',
        date: instance.date,
        startTime: instance.startTime,
        endTime: instance.endTime,
        color: instance.color,
        classType: instance.parentClass?.type,
        status: instance.status,
        participantCount: instance.participants?.length || 0,
        maxPlayers: instance.maxPlayers,
        data: instance,
      }));

    const blockEvents: CalendarEvent[] = calendarBlocks
      .filter(block => {
        if (!block.date) return false;
        const blockDate = parseISO(block.date);
        return isWithinInterval(blockDate, weekRange);
      })
      .map(block => ({
        id: block.id,
        type: 'block' as const,
        title: block.title || block.type,
        date: block.date!,
        startTime: block.startTime || '00:00',
        endTime: block.endTime || '23:59',
        blockType: block.type,
        data: block,
      }));

    return [...classEvents, ...blockEvents];
  }, [classInstances, calendarBlocks, weekRange]);

  const getEventsForDay = useCallback((date: Date): CalendarEvent[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(event => event.date === dateStr);
  }, [events]);

  const navigateWeek = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => direction === 'next' ? addWeeks(prev, 1) : subWeeks(prev, 1));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const weekLabel = useMemo(() => {
    const startMonth = format(weekStart, 'MMMM', { locale: es });
    const endMonth = format(addDays(weekStart, 6), 'MMMM yyyy', { locale: es });
    const startDay = format(weekStart, 'd');
    const endDay = format(addDays(weekStart, 6), 'd');
    
    if (startMonth === format(addDays(weekStart, 6), 'MMMM', { locale: es })) {
      return `${startDay} - ${endDay} de ${endMonth}`;
    }
    return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
  }, [weekStart]);

  return {
    currentDate,
    weekStart,
    weekDays,
    weekRange,
    weekLabel,
    events,
    getEventsForDay,
    navigateWeek,
    goToToday,
    setCurrentDate,
  };
}
