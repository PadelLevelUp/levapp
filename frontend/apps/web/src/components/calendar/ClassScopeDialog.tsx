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
import { useTranslation } from 'react-i18next';

export type ApplyScope = 'single' | 'future';
export type ClassScopeMode = 'delete' | 'edit';

interface ClassScopeDialogProps {
  open: boolean;
  mode: ClassScopeMode;
  onClose: () => void;
  onConfirm: (scope: ApplyScope) => void;
  className?: string;
}

export function ClassScopeDialog({
  open,
  mode,
  onClose,
  onConfirm,
}: ClassScopeDialogProps) {
  const { t } = useTranslation();
  const text = {
    title: t(`calendar.scope.${mode}.title`),
    description: t(`calendar.scope.${mode}.description`),
    singleTitle: t(`calendar.scope.${mode}.singleTitle`),
    singleDescription: t(`calendar.scope.${mode}.singleDescription`),
    futureTitle: t(`calendar.scope.${mode}.futureTitle`),
    futureDescription: t(`calendar.scope.${mode}.futureDescription`),
  };

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
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
