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
import { CalendarX, CalendarX2 } from 'lucide-react';

export type ApplyScope = 'single' | 'future';
export type ClassScopeMode = 'delete' | 'edit';

interface ClassScopeDialogProps {
  open: boolean;
  mode: ClassScopeMode;
  onClose: () => void;
  onConfirm: (scope: ApplyScope) => void;
  className?: string;
}

const COPY: Record<ClassScopeMode, {
  title: string;
  description: string;
  singleTitle: string;
  singleDescription: string;
  futureTitle: string;
  futureDescription: string;
}> = {
  delete: {
    title: 'Delete class',
    description: 'Which classes would you like to delete?',
    singleTitle: 'Only this class',
    singleDescription: 'Deletes only this instance',
    futureTitle: 'This and all future classes',
    futureDescription: 'Deletes this class and all following ones in the series',
  },
  edit: {
    title: 'Edit class',
    description: 'Where should these changes be applied?',
    singleTitle: 'Only this class',
    singleDescription: 'Applies changes only to this instance',
    futureTitle: 'This and all future classes',
    futureDescription: 'Applies changes to this class and all following ones',
  },
};

export function ClassScopeDialog({
  open,
  mode,
  onClose,
  onConfirm,
}: ClassScopeDialogProps) {
  const text = COPY[mode];

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {text.description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-3 py-4">
          <Button
            variant="outline"
            className="justify-start h-auto p-4 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
            onClick={() => onConfirm('single')}
          >
            <CalendarX className="w-5 h-5 mr-3 shrink-0" />
            <div className="text-left">
              <p className="font-medium">{text.singleTitle}</p>
              <p className="text-sm text-muted-foreground font-normal">
                {text.singleDescription}
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto p-4 hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
            onClick={() => onConfirm('future')}
          >
            <CalendarX2 className="w-5 h-5 mr-3 shrink-0" />
            <div className="text-left">
              <p className="font-medium">{text.futureTitle}</p>
              <p className="text-sm text-muted-foreground font-normal">
                {text.futureDescription}
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
