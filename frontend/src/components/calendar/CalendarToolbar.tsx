import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CalendarToolbarProps {
  weekLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddClass: () => void;
}

export function CalendarToolbar({ 
  weekLabel, 
  onPrevWeek, 
  onNextWeek, 
  onToday,
  onAddClass 
}: CalendarToolbarProps) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          Hoy
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onPrevWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onNextWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold capitalize ml-2">
          {weekLabel}
        </h2>
      </div>

      <Button onClick={onAddClass} className="gap-2">
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Añadir clase</span>
      </Button>
    </div>
  );
}
