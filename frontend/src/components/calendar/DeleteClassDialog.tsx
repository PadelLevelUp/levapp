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
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar clase</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Qué clases deseas eliminar?
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
              <p className="font-medium">Solo esta clase</p>
              <p className="text-sm text-muted-foreground font-normal">
                Elimina únicamente esta instancia
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
              <p className="font-medium">Esta y todas las futuras</p>
              <p className="text-sm text-muted-foreground font-normal">
                Elimina esta clase y todas las siguientes de la serie
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
