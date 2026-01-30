import { Student, PresenceStatus, AbsenceJustification } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AttendanceState {
  status: PresenceStatus | null;
  justification?: AbsenceJustification;
}

interface AttendanceRowProps {
  student: Student;
  attendance: AttendanceState;
  onChange: (attendance: AttendanceState) => void;
  disabled?: boolean;
}

export function AttendanceRow({ 
  student, 
  attendance, 
  onChange,
  disabled = false 
}: AttendanceRowProps) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleStatusChange = (status: PresenceStatus) => {
    if (status === 'present') {
      onChange({ status: 'present', justification: undefined });
    } else {
      onChange({ status: 'absent', justification: attendance.justification || 'unjustified' });
    }
  };

  const handleJustificationChange = (justification: AbsenceJustification) => {
    onChange({ status: 'absent', justification });
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {getInitials(student.name)}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{student.name}</span>
        </div>
        
        {/* Status Badge */}
        {attendance.status === 'present' && (
          <Badge variant="outline" className="text-success border-success">
            <Check className="w-3 h-3 mr-1" />
            Presente
          </Badge>
        )}
        {attendance.status === 'absent' && attendance.justification === 'justified' && (
          <Badge variant="outline" className="text-warning border-warning">
            <AlertCircle className="w-3 h-3 mr-1" />
            Justificada
          </Badge>
        )}
        {attendance.status === 'absent' && attendance.justification === 'unjustified' && (
          <Badge variant="destructive">
            <X className="w-3 h-3 mr-1" />
            No justificada
          </Badge>
        )}
      </div>

      {/* Status Buttons */}
      {!disabled && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant={attendance.status === 'present' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              "flex-1",
              attendance.status === 'present' && "bg-success hover:bg-success/90 text-success-foreground"
            )}
            onClick={() => handleStatusChange('present')}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Presente
          </Button>
          <Button
            type="button"
            variant={attendance.status === 'absent' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              "flex-1",
              attendance.status === 'absent' && "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            )}
            onClick={() => handleStatusChange('absent')}
          >
            <X className="w-4 h-4 mr-1" />
            Ausente
          </Button>
        </div>
      )}

      {/* Justification Buttons (only shown when absent) */}
      {!disabled && attendance.status === 'absent' && (
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant={attendance.justification === 'justified' ? 'default' : 'outline'}
            size="sm"
            className={cn(
              "flex-1 text-xs",
              attendance.justification === 'justified' && "bg-warning hover:bg-warning/90 text-warning-foreground"
            )}
            onClick={() => handleJustificationChange('justified')}
          >
            <AlertCircle className="w-3 h-3 mr-1" />
            Justificada
          </Button>
          <Button
            type="button"
            variant={attendance.justification === 'unjustified' ? 'destructive' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => handleJustificationChange('unjustified')}
          >
            <X className="w-3 h-3 mr-1" />
            No justificada
          </Button>
        </div>
      )}
    </div>
  );
}
