import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CalendarLegend } from './CalendarLegend';

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
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 border-b border-border bg-card">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
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
        <h2 className="text-base sm:text-lg font-semibold ml-1 sm:ml-2 whitespace-nowrap">
          {weekLabel}
        </h2>
      </div>

      {/* Between the dates and the actions, so the key to the grid sits with
          the controls rather than floating above the columns. `order` puts it
          on its own line on narrow screens instead of squeezing the buttons. */}
      <CalendarLegend className="order-last w-full lg:order-none lg:w-auto lg:flex-1 lg:justify-center" />

      <div className="flex items-center gap-2 shrink-0">
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
