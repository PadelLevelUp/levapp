import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { X, Users, Clock, Calendar, Plus, Minus, Repeat } from 'lucide-react';
import { ClassType, Student, CoachLevel } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { mockStudents, mockLevels } from '@/data/mockData';

interface AddClassSheetProps {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
  initialTime?: string;
  onSave?: (data: any) => void;
}

const COLORS = [
  '#0ea5e9', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f97316', // orange
  '#22c55e', // green
  '#eab308', // yellow
  '#ef4444', // red
  '#6366f1', // indigo
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
];

export function AddClassSheet({ 
  open, 
  onClose, 
  initialDate,
  initialTime,
  onSave 
}: AddClassSheetProps) {
  const [classType, setClassType] = useState<ClassType>('academy');
  const [isRecurring, setIsRecurring] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(initialDate ? format(initialDate, 'yyyy-MM-dd') : '');
  const [startTime, setStartTime] = useState(initialTime || '09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState<string>('');

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const handleSave = () => {
    const data = {
      type: classType,
      isRecurring,
      name,
      date,
      startTime,
      endTime,
      maxPlayers,
      color: selectedColor,
      levelId: selectedLevel,
      studentIds: selectedStudents,
      recurrenceRule: isRecurring ? {
        frequency: 'weekly' as const,
        daysOfWeek: selectedDays,
      } : undefined,
      endDate: isRecurring ? endDate : undefined,
    };
    onSave?.(data);
    handleClose();
  };

  const handleClose = () => {
    setClassType('academy');
    setIsRecurring(false);
    setName('');
    setDate(initialDate ? format(initialDate, 'yyyy-MM-dd') : '');
    setStartTime(initialTime || '09:00');
    setEndTime('10:30');
    setMaxPlayers(4);
    setSelectedColor(COLORS[0]);
    setSelectedLevel('');
    setSelectedStudents([]);
    setSelectedDays([]);
    setEndDate('');
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva clase</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Class Type */}
          <Tabs value={classType} onValueChange={(v) => setClassType(v as ClassType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="academy">Academia</TabsTrigger>
              <TabsTrigger value="private">Privada</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre (opcional)</Label>
            <Input
              id="name"
              placeholder={classType === 'academy' ? 'Ej: Academia Iniciación' : 'Ej: Privada Juan y María'}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "w-8 h-8 rounded-full transition-all",
                    selectedColor === color && "ring-2 ring-offset-2 ring-primary"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Recurring Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="recurring">Clase recurrente</Label>
            </div>
            <Switch
              id="recurring"
              checked={isRecurring}
              onCheckedChange={setIsRecurring}
            />
          </div>

          {/* Date/Time or Recurrence */}
          {isRecurring ? (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label>Días de la semana</Label>
                <div className="flex gap-1">
                  {DAYS_OF_WEEK.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleDay(value)}
                      className={cn(
                        "w-9 h-9 rounded-full text-sm font-medium transition-colors",
                        selectedDays.includes(value)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted-foreground/10"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Fecha inicio</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">Fecha fin (opcional)</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Hora inicio</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">Hora fin</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-time">Inicio</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">Fin</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Max Players */}
          <div className="space-y-2">
            <Label>Máximo jugadores</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMaxPlayers(Math.max(1, maxPlayers - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-lg font-semibold w-8 text-center">{maxPlayers}</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMaxPlayers(maxPlayers + 1)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Level */}
          <div className="space-y-2">
            <Label>Nivel (opcional)</Label>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar nivel" />
              </SelectTrigger>
              <SelectContent>
                {mockLevels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.code} - {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Students */}
          <div className="space-y-2">
            <Label>Participantes</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
              {mockStudents.map((student) => (
                <div
                  key={student.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                    selectedStudents.includes(student.id)
                      ? "bg-primary/10"
                      : "hover:bg-muted"
                  )}
                  onClick={() => toggleStudent(student.id)}
                >
                  <Checkbox
                    checked={selectedStudents.includes(student.id)}
                    onCheckedChange={() => toggleStudent(student.id)}
                  />
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(student.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{student.name}</span>
                </div>
              ))}
            </div>
            {selectedStudents.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedStudents.length} seleccionados
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Crear clase
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
