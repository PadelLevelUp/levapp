import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Users, Clock, Calendar, Trash2, Edit, Check } from 'lucide-react';
import { CalendarEvent, ClassInstance, PresenceStatus, AbsenceJustification } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { DeleteClassDialog, DeleteScope } from './DeleteClassDialog';
import { AttendanceRow, AttendanceState } from './AttendanceRow';

interface AttendanceRecord {
  [studentId: string]: AttendanceState;
}

interface ClassDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent, scope: DeleteScope) => void;
  onValidateAttendance?: (event: CalendarEvent, attendance: AttendanceRecord) => void;
}

export function ClassDetailSheet({ 
  event, 
  open, 
  onClose,
  onEdit,
  onDelete,
  onValidateAttendance
}: ClassDetailSheetProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceRecord>({});
  const [isValidating, setIsValidating] = useState(false);

  const classInstance = event?.type !== 'block' ? (event?.data as ClassInstance) : null;
  
  // Initialize attendance state when event changes
  useEffect(() => {
    if (classInstance?.participants) {
      const initialAttendance: AttendanceRecord = {};
      classInstance.participants.forEach((student) => {
        // Check if there's existing presence data
        const existingPresence = classInstance.presences?.find(p => p.studentId === student.id);
        initialAttendance[student.id] = {
          status: existingPresence?.status || null,
          justification: existingPresence?.justification
        };
      });
      setAttendance(initialAttendance);
    }
    setIsValidating(false);
  }, [event?.id]);
  
  if (!event || event.type === 'block' || !classInstance) return null;

  const isCompleted = classInstance.status === 'completed';
  const isCanceled = classInstance.status === 'canceled';

  const handleAttendanceChange = (studentId: string, state: AttendanceState) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: state
    }));
  };

  const handleValidateAttendance = () => {
    onValidateAttendance?.(event, attendance);
  };

  const allAttendanceMarked = classInstance.participants?.every(
    student => attendance[student.id]?.status !== null
  ) ?? false;

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

          {/* Participants & Attendance */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                {isValidating ? 'Validar asistencia' : 'Participantes'} ({classInstance.participants?.length || 0}/{classInstance.maxPlayers})
              </h4>
              {!isCompleted && !isCanceled && !isValidating && classInstance.participants && classInstance.participants.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsValidating(true)}
                  className="text-xs"
                >
                  Marcar asistencia
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {classInstance.participants?.map((student) => (
                <AttendanceRow
                  key={student.id}
                  student={student}
                  attendance={attendance[student.id] || { status: null }}
                  onChange={(state) => handleAttendanceChange(student.id, state)}
                  disabled={!isValidating || isCompleted}
                />
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

          {isValidating && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsValidating(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!allAttendanceMarked}
                onClick={handleValidateAttendance}
              >
                <Check className="w-4 h-4 mr-2" />
                Confirmar
              </Button>
            </div>
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
