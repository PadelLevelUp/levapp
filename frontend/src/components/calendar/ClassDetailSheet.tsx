import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, Clock, Calendar, Trash2, Edit, Check } from 'lucide-react';
import { CalendarEvent, ClassInstance } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DeleteClassDialog, DeleteScope } from './DeleteClassDialog';

interface ClassDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent, scope: DeleteScope) => void;
}

export function ClassDetailSheet({ 
  event, 
  open, 
  onClose,
  onEdit,
  onDelete 
}: ClassDetailSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  if (!event || event.type === 'block') return null;

  const classInstance = event.data as ClassInstance;
  const isCompleted = classInstance.status === 'completed';
  const isCanceled = classInstance.status === 'canceled';

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div 
                className="w-3 h-12 rounded-full shrink-0"
                style={{ backgroundColor: event.color }}
              />
              <div>
                <SheetTitle className="text-left">{event.title}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={classInstance.parentClass?.type === 'academy' ? 'default' : 'secondary'}>
                    {classInstance.parentClass?.type === 'academy' ? 'Academia' : 'Privada'}
                  </Badge>
                  {isCompleted && (
                    <Badge variant="outline" className="text-success border-success">
                      Completada
                    </Badge>
                  )}
                  {isCanceled && (
                    <Badge variant="destructive">Cancelada</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Date & Time */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="capitalize">
                {format(new Date(event.date), "EEEE, d 'de' MMMM", { locale: es })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>{event.startTime} - {event.endTime}</span>
            </div>
          </div>

          <Separator />

          {/* Participants */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Participantes ({classInstance.participants?.length || 0}/{classInstance.maxPlayers})
            </h4>
            <div className="space-y-2">
              {classInstance.participants?.map((student) => (
                <div 
                  key={student.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(student.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{student.name}</span>
                  </div>
                  {isCompleted && (
                    <Badge variant="outline" className="text-success border-success">
                      <Check className="w-3 h-3 mr-1" />
                      Presente
                    </Badge>
                  )}
                </div>
              ))}
              {(!classInstance.participants || classInstance.participants.length === 0) && (
                <p className="text-sm text-muted-foreground">Sin participantes</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {classInstance.notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Notas</h4>
                <p className="text-sm text-muted-foreground">{classInstance.notes}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => onEdit?.(event)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button 
              variant="outline" 
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {!isCompleted && !isCanceled && (
            <Button className="w-full">
              <Check className="w-4 h-4 mr-2" />
              Validar asistencia
            </Button>
          )}
        </div>
      </SheetContent>

      <DeleteClassDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={(scope) => {
          setDeleteDialogOpen(false);
          onDelete?.(event, scope);
        }}
      />
    </Sheet>
  );
}
