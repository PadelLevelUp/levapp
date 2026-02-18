import { useState, useEffect } from 'react';
import { format, addMonths } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { X, Users, Clock, Calendar, Plus, Minus, Repeat } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ClassType, CoachPlayer, CoachLevel } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const COACH_ID = "1";

interface AddClassSheetProps {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
  initialTime?: string;
  onSave?: (data: any) => void;
  
  players: CoachPlayer[];
  levels: CoachLevel[];
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
  { value: 1, label: 'M' }, // Monday
  { value: 2, label: 'T' }, // Tuesday
  { value: 3, label: 'W' }, // Wednesday
  { value: 4, label: 'T' }, // Thursday
  { value: 5, label: 'F' }, // Friday
  { value: 6, label: 'S' }, // Saturday
  { value: 0, label: 'S' }, // Sunday
];

export function AddClassSheet({ 
  open,
  onClose,
  initialDate,
  initialTime,
  onSave,
  players,
  levels,
}: AddClassSheetProps) {
  const [classType, setClassType] = useState<ClassType>('academy');
  const [isRecurring, setIsRecurring] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(
    initialDate ? format(initialDate, 'yyyy-MM-dd', { locale: enUS }) : ''
  );
  const [startTime, setStartTime] = useState(initialTime || '09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  useEffect(() => {
    if (!isRecurring || !date) return;

    const weekday = getWeekdayFromDate(date);
    if (weekday === null) return;

    setSelectedDays(prev =>
      prev.includes(weekday) ? prev : [weekday, ...prev]
    );
  }, [isRecurring, date]);

  const getWeekdayFromDate = (dateStr: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).getDay(); // 0 (Sun) → 6 (Sat)
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  // Auto-adjust endTime when startTime changes
  useEffect(() => {
    if (!startTime) return;
    if (endTime <= startTime) {
      const [h, m] = startTime.split(':').map(Number);
      const totalMin = h * 60 + m + 90; // default 1.5h duration
      const newH = Math.min(Math.floor(totalMin / 60), 23);
      const newM = totalMin % 60;
      setEndTime(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
    }
  }, [startTime]);

  const handleSave = () => {
    const newErrors: Record<string, boolean> = {};
    if (!date) newErrors.date = true;
    if (isRecurring && selectedDays.length === 0) newErrors.days = true;
    if (isRecurring && !endDate) newErrors.endDate = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const missing = [
        newErrors.date && 'Date',
        newErrors.days && 'Days of the week',
        newErrors.endDate && 'End date',
      ].filter(Boolean).join(', ');
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: `Please fill in: ${missing}`,
      });
      return;
    }
    setErrors({});

    const computedEndDate =
      isRecurring
        ? endDate || format(addMonths(new Date(date), 1), 'yyyy-MM-dd')
        : null;

    const data = {
      coachId: COACH_ID,
      classType,
      isRecurring,
      name,
      date,
      startTime,
      endTime,
      maxPlayers,
      color: selectedColor,
      levelId: selectedLevel || null,
      playerIds: selectedPlayers,

      recurrenceRule: isRecurring
        ? {
            frequency: 'weekly',
            daysOfWeek: selectedDays,
          }
        : null,

      endDate: computedEndDate,
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
    setSelectedPlayers([]);
    setSelectedDays([]);
    setEndDate('');
    setErrors({});
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New class</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Class Type */}
          <Tabs value={classType} onValueChange={(v) => setClassType(v as ClassType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="academy">Academy</TabsTrigger>
              <TabsTrigger value="private">Private</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder={
                classType === 'academy'
                  ? 'e.g. Beginner Academy'
                  : 'e.g. Private – John & Mary'
              }
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
                    'w-8 h-8 rounded-full transition-all',
                    selectedColor === color &&
                      'ring-2 ring-offset-2 ring-primary'
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
              <Label htmlFor="recurring">Recurring class</Label>
            </div>
            <Switch
              id="recurring"
              checked={isRecurring}
              onCheckedChange={setIsRecurring}
            />
          </div>

          {/* Date / Recurrence */}
          {isRecurring ? (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label>Days of the week</Label>
                <div className={cn("flex gap-1 p-1 rounded-lg", errors.days && "ring-2 ring-destructive")}>
                  {DAYS_OF_WEEK.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => { toggleDay(value); setErrors(e => ({ ...e, days: false })); }}
                      className={cn(
                        'w-9 h-9 rounded-full text-sm font-medium transition-colors',
                        selectedDays.includes(value)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted-foreground/10'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    className={cn(errors.date && "border-destructive ring-1 ring-destructive")}
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setErrors(er => ({ ...er, date: false })); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    className={cn(errors.endDate && "border-destructive ring-1 ring-destructive")}
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setErrors(er => ({ ...er, endDate: false })); }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Start time</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-time">End time</Label>
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
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  className={cn(errors.date && "border-destructive ring-1 ring-destructive")}
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setErrors(er => ({ ...er, date: false })); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start-time">Start</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End</Label>
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
            <Label>Max players</Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMaxPlayers(Math.max(1, maxPlayers - 1))}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-lg font-semibold w-8 text-center">
                {maxPlayers}
              </span>
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
            <Label>Level (optional)</Label>
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((level) => (
                  <SelectItem key={level.id} value={level.id}>
                    {level.code} – {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Players */}
          <div className="space-y-2">
            <Label>Participants</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
              {players.map((player) => (
                <div
                  key={player.playerId}
                  className={cn(
                    'flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors',
                    selectedPlayers.includes(player.playerId)
                      ? 'bg-primary/10'
                      : 'hover:bg-muted'
                  )}
                  onClick={() => togglePlayer(player.playerId)}
                >
                  <Checkbox
                    checked={selectedPlayers.includes(player.playerId)}
                    onCheckedChange={() => togglePlayer(player.playerId)}
                  />
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(player.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{player.name}</span>
                </div>
              ))}
            </div>
            {selectedPlayers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedPlayers.length} selected
              </p>
            )}
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Create class
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
