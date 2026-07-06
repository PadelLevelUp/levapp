import { useState, useEffect } from 'react';
import { format, addMonths } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Users, Clock, Calendar, Plus, Minus, Repeat, Bell, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { ClassType, CoachPlayer, CoachLevel } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlayerSelector } from './PlayerSelector';
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
import { cn } from '@/lib/utils';
import { useAutoInviteEnabled } from '@/hooks/useAutoInviteEnabled';
import { LevelLabel } from '@/components/LevelLabel';

const COACH_ID = "1";

interface AddClassSheetProps {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
  initialTime?: string;
  onSave?: (data: any) => void;
  players: CoachPlayer[];
  levels: CoachLevel[];
  loading?: boolean;
}

const COLORS = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f97316',
  '#22c55e', '#eab308', '#ef4444', '#6366f1',
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

export function AddClassSheet({
  open,
  onClose,
  initialDate,
  initialTime,
  onSave,
  players,
  levels,
  loading = false,
}: AddClassSheetProps) {
  const { t } = useTranslation();
  const autoInviteEnabled = useAutoInviteEnabled(open);
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const togglePlayer = (playerId: string) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ? format(initialDate, 'yyyy-MM-dd', { locale: enUS }) : '');
    setStartTime(initialTime || '09:00');
  }, [open, initialDate, initialTime]);

  useEffect(() => {
    if (!isRecurring || !date) return;
    const weekday = new Date(date).getDay();
    setSelectedDays(prev => prev.includes(weekday) ? prev : [weekday, ...prev]);
  }, [isRecurring, date]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  useEffect(() => {
    if (!startTime) return;
    if (endTime <= startTime) {
      const [h, m] = startTime.split(':').map(Number);
      const totalMin = h * 60 + m + 90;
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
        newErrors.date && t('calendar.addClass.fieldDate'),
        newErrors.days && t('calendar.addClass.fieldDays'),
        newErrors.endDate && t('calendar.addClass.fieldEndDate'),
      ].filter(Boolean).join(', ');
      toast({ variant: 'destructive', title: t('calendar.addClass.missingFieldsTitle'), description: t('calendar.addClass.missingFieldsDescription', { fields: missing }) });
      return;
    }
    setErrors({});

    const computedEndDate = isRecurring
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
      notificationsEnabled,
      recurrenceRule: isRecurring
        ? { frequency: 'weekly', daysOfWeek: selectedDays }
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
    setNotificationsEnabled(true);
    setErrors({});
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("calendar.addClass.title")}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Class Type */}
          <Tabs value={classType} onValueChange={(v) => setClassType(v as ClassType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="academy">{t("calendar.addClass.typeAcademy")}</TabsTrigger>
              <TabsTrigger value="private">{t("calendar.addClass.typePrivate")}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Name */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.name")}</span>
            <Input
              placeholder={classType === 'academy' ? t("calendar.addClass.namePlaceholderAcademy") : t("calendar.addClass.namePlaceholderPrivate")}
              value={name}
              className="h-8 text-sm"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* 2×2 Info Blocks */}
          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className={cn("rounded-lg border bg-muted/30 p-3 space-y-1 min-w-0", errors.date && "ring-2 ring-destructive")}>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.addClass.date")}</span>
              </div>
              <Input
                type="date"
                value={date}
                className="h-8 text-sm min-w-0"
                onChange={(e) => { setDate(e.target.value); setErrors(er => ({ ...er, date: false })); }}
              />
            </div>

            {/* Time */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.addClass.time")}</span>
              </div>
              <div className="space-y-1">
                <Input
                  type="time"
                  value={startTime}
                  className="h-8 text-sm min-w-0"
                  onChange={(e) => setStartTime(e.target.value)}
                />
                <Input
                  type="time"
                  value={endTime}
                  className="h-8 text-sm min-w-0"
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            {/* Capacity */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.addClass.capacity")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setMaxPlayers(Math.max(1, maxPlayers - 1))}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="w-6 text-center text-sm font-semibold">{maxPlayers}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setMaxPlayers(maxPlayers + 1)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Level */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-xs font-medium">{t("calendar.addClass.level")}</span>
              </div>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t("calendar.addClass.selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      <LevelLabel code={level.code} label={level.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Recurring */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.addClass.recurring")}</span>
              </div>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
            {isRecurring && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.daysOfWeek")}</span>
                  <div className={cn("flex gap-1", errors.days && "ring-2 ring-destructive rounded-lg p-0.5")}>
                    {DAYS_OF_WEEK.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => { toggleDay(value); setErrors(e => ({ ...e, days: false })); }}
                        className={cn(
                          'w-8 h-8 rounded-full text-xs font-medium transition-colors',
                          selectedDays.includes(value)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-accent'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={cn("space-y-1", errors.endDate && "ring-2 ring-destructive rounded-lg p-1")}>
                  <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.endDate")}</span>
                  <Input
                    type="date"
                    value={endDate}
                    className="h-8 text-sm"
                    onChange={(e) => { setEndDate(e.target.value); setErrors(er => ({ ...er, endDate: false })); }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Auto notifications */}
          {autoInviteEnabled && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm font-medium">{t("calendar.addClass.autoNotifications")}</span>
                    <p className="text-xs text-muted-foreground">{t("calendar.addClass.autoNotificationsDescription")}</p>
                  </div>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>
            </div>
          )}

          {/* Color */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.color")}</span>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-all',
                    selectedColor === color && 'ring-2 ring-offset-2 ring-primary'
                  )}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.participants")}</span>
            <PlayerSelector
              players={players}
              levels={levels}
              selectedPlayerIds={selectedPlayers}
              classLevelId={selectedLevel || null}
              onToggle={togglePlayer}
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={handleClose} disabled={loading}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? t("calendar.addClass.creating") : t("calendar.addClass.createClass")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
