import { format, isToday } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface CalendarHeaderProps {
  weekDays: Date[];
}

export function CalendarHeader({ weekDays }: CalendarHeaderProps) {
  return (
    <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30">
      <div className="h-14" /> {/* Time column spacer */}
      {weekDays.map((day) => {
        const dayIsToday = isToday(day);
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "h-14 flex flex-col items-center justify-center border-l border-border",
              dayIsToday && "bg-primary/5"
            )}
          >
            <span className="text-xs text-muted-foreground uppercase">
              {format(day, 'EEE', { locale: enGB })}
            </span>
            <span 
              className={cn(
                "text-lg font-semibold",
                dayIsToday && "w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
              )}
            >
              {format(day, 'd')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
