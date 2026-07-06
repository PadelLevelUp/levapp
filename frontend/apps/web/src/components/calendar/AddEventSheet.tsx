import { useState, useEffect } from 'react';
import { format, addMonths } from 'date-fns';
import { Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import type { CalendarBlockType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

const DAYS_OF_WEEK = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

interface AddEventSheetProps {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
  initialTime?: string;
  onSave?: (data: any) => void;
}

export function AddEventSheet({ open, onClose, initialDate, initialTime, onSave }: AddEventSheetProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [type, setType] = useState<CalendarBlockType>('personal');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate ? format(initialDate, 'yyyy-MM-dd') : '');
  const [startTime, setStartTime] = useState(initialTime || '09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isRecurring || !date) return;
    const weekday = new Date(date).getDay();
    setSelectedDays(prev => prev.includes(weekday) ? prev : [weekday, ...prev]);
  }, [isRecurring, date]);

  useEffect(() => {
    if (!startTime) return;
    if (endTime <= startTime) {
      const [h, m] = startTime.split(':').map(Number);
      const total = h * 60 + m + 60;
      const newH = Math.min(Math.floor(total / 60), 23);
      const newM = total % 60;
      setEndTime(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
    }
  }, [startTime]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = () => {
    const newErrors: Record<string, boolean> = {};
    if (!date) newErrors.date = true;
    if (isRecurring && selectedDays.length === 0) newErrors.days = true;
    if (isRecurring && !endDate) newErrors.endDate = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const missing = [
        newErrors.date && t('calendar.addEvent.fieldDate'),
        newErrors.days && t('calendar.addEvent.fieldDays'),
        newErrors.endDate && t('calendar.addEvent.fieldEndDate'),
      ].filter(Boolean).join(', ');
      toast({ variant: 'destructive', title: t('calendar.addEvent.missingFieldsTitle'), description: t('calendar.addEvent.missingFieldsDescription', { fields: missing }) });
      return;
    }
    setErrors({});

    onSave?.({
      type,
      title: title || null,
      description: description || null,
      date,
      startTime,
      endTime,
      isRecurring,
      recurrenceRule: isRecurring ? { frequency: 'weekly', daysOfWeek: selectedDays } : null,
      endDate: isRecurring ? (endDate || format(addMonths(new Date(date), 1), 'yyyy-MM-dd')) : null,
    });
    handleClose();
  };

  const handleClose = () => {
    setType('personal');
    setTitle('');
    setDescription('');
    setDate(initialDate ? format(initialDate, 'yyyy-MM-dd') : '');
    setStartTime(initialTime || '09:00');
    setEndTime('10:00');
    setIsRecurring(false);
    setSelectedDays([]);
    setEndDate('');
    setErrors({});
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("calendar.addEvent.title")}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label>{t("calendar.addEvent.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as CalendarBlockType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">{t("calendar.addEvent.typePersonal")}</SelectItem>
                <SelectItem value="break">{t("calendar.addEvent.typeBreak")}</SelectItem>
                <SelectItem value="holiday">{t("calendar.addEvent.typeHoliday")}</SelectItem>
                <SelectItem value="off_work">{t("calendar.addEvent.typeOffWork")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-title">{t("calendar.addEvent.titleLabel")}</Label>
            <Input
              id="event-title"
              placeholder={t("calendar.addEvent.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-description">{t("calendar.addEvent.descriptionLabel")}</Label>
            <Input
              id="event-description"
              placeholder={t("calendar.addEvent.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="event-recurring">{t("calendar.addEvent.recurring")}</Label>
            </div>
            <Switch id="event-recurring" checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {isRecurring ? (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label>{t("calendar.addEvent.daysOfWeek")}</Label>
                <div className={cn('flex gap-1 p-1 rounded-lg', errors.days && 'ring-2 ring-destructive')}>
                  {DAYS_OF_WEEK.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => { toggleDay(value); setErrors(e => ({ ...e, days: false })); }}
                      className={cn(
                        'w-9 h-9 rounded-full text-sm font-medium transition-colors',
                        selectedDays.includes(value) ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted-foreground/10'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("calendar.addEvent.startDate")}</Label>
                  <Input
                    type="date"
                    className={cn(errors.date && 'border-destructive ring-1 ring-destructive')}
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setErrors(er => ({ ...er, date: false })); }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("calendar.addEvent.endDate")}</Label>
                  <Input
                    type="date"
                    className={cn(errors.endDate && 'border-destructive ring-1 ring-destructive')}
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setErrors(er => ({ ...er, endDate: false })); }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("calendar.addEvent.startTime")}</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("calendar.addEvent.endTime")}</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("calendar.addEvent.dateShort")}</Label>
                <Input
                  type="date"
                  className={cn(errors.date && 'border-destructive ring-1 ring-destructive')}
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setErrors(er => ({ ...er, date: false })); }}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("calendar.addEvent.startShort")}</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("calendar.addEvent.endShort")}</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={handleClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSave}>{t("calendar.addEvent.createEvent")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
