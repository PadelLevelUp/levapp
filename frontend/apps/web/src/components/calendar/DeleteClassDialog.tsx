import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CalendarX, CalendarX2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type DeleteScope = 'single' | 'future';

interface DeleteClassDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: DeleteScope) => void;
  className?: string;
}

export function DeleteClassDialog({ 
  open, 
  onClose, 
  onConfirm,
  className
}: DeleteClassDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("calendar.deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("calendar.deleteDialog.description")}
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
              <p className="font-medium">{t("calendar.deleteDialog.singleTitle")}</p>
              <p className="text-sm text-muted-foreground font-normal">
                {t("calendar.deleteDialog.singleDescription")}
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
              <p className="font-medium">{t("calendar.deleteDialog.futureTitle")}</p>
              <p className="text-sm text-muted-foreground font-normal">
                {t("calendar.deleteDialog.futureDescription")}
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
