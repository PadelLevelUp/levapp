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
import { enUS } from 'date-fns/locale';
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
  if (!event) return null;

  const formattedDate = format(parseISO(newDate), 'EEEE, MMMM d', { locale: enUS });
  const isRecurring = event.isRecurring;

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Reschedule "{event.title}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Move to {formattedDate}, {newStartTime}–{newEndTime}
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
                <p className="font-medium">Only this event</p>
                <p className="text-sm text-muted-foreground font-normal">Moves only this occurrence</p>
              </div>
            </Button>

            <Button
              variant="outline"
              className="justify-start h-auto p-4"
              onClick={() => onConfirm('future')}
            >
              <CalendarRange className="w-5 h-5 mr-3 shrink-0" />
              <div className="text-left">
                <p className="font-medium">This and all future events</p>
                <p className="text-sm text-muted-foreground font-normal">Moves this and all following occurrences</p>
              </div>
            </Button>
          </div>
        ) : (
          <div className="py-4">
            <Button className="w-full" onClick={() => onConfirm('single')}>
              Reschedule
            </Button>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
