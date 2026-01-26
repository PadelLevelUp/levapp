import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { X, Users, Clock, Calendar, MapPin, Trash2, Edit, Check } from 'lucide-react';
import { CalendarEvent } from '@/types';
import { getClassInstance } from '@/api/classes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useState, useEffect } from 'react';
import { ClassInstance } from '@/types';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ClassScopeDialog,
  ApplyScope,
} from './ClassScopeDialog';
interface ClassDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (event: CalendarEvent, scope: ApplyScope) => void;
  onDelete?: (event: CalendarEvent, scope: ApplyScope) => void;
}

export function ClassDetailSheet({ 
  event, 
  open, 
  onClose,
  onEdit,
  onDelete,
  onValidateAttendance
}: ClassDetailSheetProps) {

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [classInstance, setClassInstance] = useState<ClassInstance | null>(null);

  useEffect(() => {
    if (!event) return;

    let mounted = true;

    async function loadClassInstance() {
      const data = await getClassInstance(event);
      if (mounted) {
        setClassInstance(data);
      }
    }

    loadClassInstance();

    return () => {
      mounted = false;
    };
  }, [event]);

  if (!event || event.type === 'block') return null;
  if (!classInstance) return null;

  //ClassInstance just the instance of a class, came from the event. Now should be fetched from the db

  const isCompleted = classInstance.status === 'completed';
  const isScheduled = classInstance.status === 'scheduled';
  const isCanceled = classInstance.status === 'canceled';

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  

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
                  <Badge
                    variant={classInstance.classType === 'academy' ? 'default' : 'secondary'}
                  >
                    {classInstance.classType === 'academy'
                      ? 'Academy'
                      : 'Private'}
                  </Badge>

                  {isCompleted && (
                    <Badge variant="outline" className="text-success border-success">
                      Completed
                    </Badge>
                  )}

                  {isCanceled && (
                    <Badge variant="destructive">Canceled</Badge>
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
                {format(new Date(event.date), 'EEEE, MMMM d', { locale: enUS })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>{event.startTime} – {event.endTime}</span>
            </div>
          </div>

          <Separator />

          {/* Participants & Attendance */}
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Participants ({classInstance.participants?.length || 0}/{classInstance.maxPlayers})
            </h4>

            <div className="space-y-2">
              {classInstance.participants?.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(player.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{player.user.name}</span>
                  </div>

                  {isCompleted && (
                    <Badge variant="outline" className="text-success border-success">
                      <Check className="w-3 h-3 mr-1" />
                      Present
                    </Badge>
                  )}
                </div>
              ))}

              {(!classInstance.participants || classInstance.participants.length === 0) && (
                <p className="text-sm text-muted-foreground">
                  No participants
                </p>
              )}
            </div>
          </div>

          {/* Notes */}
          {classInstance.notes && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground">
                  {classInstance.notes}
                </p>
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
              Edit
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
              Validate attendance
            </Button>
          )}
        </div>
      </SheetContent>
      <ClassScopeDialog
        open={deleteDialogOpen}
        mode="delete"
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={(scope) => {
          setDeleteDialogOpen(false);
          onDelete?.(event, scope);
        }}
      />
    </Sheet>
  );
}
