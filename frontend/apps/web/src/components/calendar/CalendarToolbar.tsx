import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface CalendarToolbarProps {
  weekLabel: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddClass?: () => void;
  onAddEvent?: () => void;
}

export function CalendarToolbar({
  weekLabel,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddClass,
  onAddEvent,
}: CalendarToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          {t("calendar.toolbar.today")}
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onPrevWeek} aria-label={t("calendar.toolbar.previousWeek")}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onNextWeek} aria-label={t("calendar.toolbar.nextWeek")}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <h2 className="text-lg font-semibold ml-2">
          {weekLabel}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        {onAddEvent && (
          <Button variant="outline" onClick={onAddEvent} className="gap-2">
            <CalendarPlus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("calendar.toolbar.addEvent")}</span>
          </Button>
        )}
        {onAddClass && (
          <Button onClick={onAddClass} className="gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("calendar.toolbar.addClass")}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
