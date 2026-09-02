import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CalendarClock, CalendarRange } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { dateFnsLocale } from '@/lib/dateLocale';
import type { CalendarEvent } from '@/types';
import type { ApplyScope } from './ClassScopeDialog';

interface RescheduleDialogProps {
  event: CalendarEvent | null;
  newDate: string;
  newStartTime: string;
  newEndTime: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: ApplyScope) => void;
}

export function RescheduleDialog({
  event,
  newDate,
  newStartTime,
  newEndTime,
  open,
  onClose,
  onConfirm,
}: RescheduleDialogProps) {
  const { t, i18n } = useTranslation();
  if (!event) return null;

  const formattedDate = format(parseISO(newDate), 'EEEE, MMMM d', { locale: dateFnsLocale(i18n.language) });
  const isRecurring = event.isRecurring;

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("calendar.reschedule.title", { title: event.title })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("calendar.reschedule.description", { date: formattedDate, start: newStartTime, end: newEndTime })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isRecurring ? (
          <div className="flex flex-col gap-3 py-4">
            <Button
              variant="outline"
              className="justify-start h-auto p-4"
              onClick={() => onConfirm('single')}
            >
              <CalendarClock className="w-5 h-5 mr-3 shrink-0" />
              <div className="text-left">
                <p className="font-medium">{t("calendar.reschedule.onlyThisEvent")}</p>
                <p className="text-sm text-muted-foreground font-normal">{t("calendar.reschedule.onlyThisEventDescription")}</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="justify-start h-auto p-4"
              onClick={() => onConfirm('future')}
            >
              <CalendarRange className="w-5 h-5 mr-3 shrink-0" />
              <div className="text-left">
                <p className="font-medium">{t("calendar.reschedule.thisAndFutureEvents")}</p>
                <p className="text-sm text-muted-foreground font-normal">{t("calendar.reschedule.thisAndFutureEventsDescription")}</p>
              </div>
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <Button className="w-full" onClick={() => onConfirm('single')}>
              {t("calendar.reschedule.reschedule")}
            </Button>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
