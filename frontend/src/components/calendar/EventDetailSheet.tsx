import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Calendar, Clock, Edit, Save, Trash2, X, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import type { CalendarEvent, CalendarBlockType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getCalendarBlock, editCalendarBlock, deleteCalendarBlock } from '@/api/calendar';
import { ClassScopeDialog } from './ClassScopeDialog';
import type { ApplyScope } from './ClassScopeDialog';

const DAYS_OF_WEEK = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 0, label: 'S' },
];

interface Draft {
  type: CalendarBlockType;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  selectedDays: number[];
  endDate: string;
}

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: (event: CalendarEvent) => void;
}

export function EventDetailSheet({ event, open, onClose, onSaved, onDeleted }: EventDetailSheetProps) {
  const { t } = useTranslation();
  const BLOCK_TYPE_LABELS: Record<CalendarBlockType, string> = {
    personal: t('calendar.eventDetail.typePersonal'),
    break: t('calendar.eventDetail.typeBreak'),
    holiday: t('calendar.eventDetail.typeHoliday'),
    off_work: t('calendar.eventDetail.typeOffWork'),
  };
  const { toast } = useToast();
  const [block, setBlock] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);

  useEffect(() => {
    if (!event || event.type !== 'block') return;
    setBlock(null);
    setIsEditing(false);
    setDraft(null);
    getCalendarBlock(event.originalId).then(setBlock).catch(() => {});
  }, [event]);

  if (!event || event.type !== 'block' || !block) return null;

  const startEdit = () => {
    setDraft({
      type: block.type,
      title: block.title ?? '',
      description: block.description ?? '',
      date: block.date ?? event.date,
      startTime: block.startTime ?? event.startTime,
      endTime: block.endTime ?? event.endTime,
      isRecurring: block.isRecurring ?? false,
      selectedDays: block.recurrenceRule?.daysOfWeek ?? [],
      endDate: block.recurrenceEnd ?? '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await editCalendarBlock(event.originalId, {
        type: draft.type,
        title: draft.title || null,
        description: draft.description || null,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        isRecurring: draft.isRecurring,
        recurrenceRule: draft.isRecurring ? { frequency: 'weekly', daysOfWeek: draft.selectedDays } : null,
        endDate: draft.isRecurring ? draft.endDate || null : null,
      });
      setBlock(updated);
      setIsEditing(false);
      setDraft(null);
      onSaved();
      toast({ title: t('calendar.eventDetail.eventUpdated') });
    } catch {
      toast({ variant: 'destructive', title: t('calendar.eventDetail.failedUpdateEvent') });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (block?.isRecurring) {
      setScopeDialogOpen(true);
    } else {
      confirmDelete();
    }
  };

  const confirmDelete = async (scope?: ApplyScope) => {
    setScopeDialogOpen(false);
    try {
      await deleteCalendarBlock(
        event.originalId,
        scope ? { occDate: event.date, scope } : undefined
      );
      onDeleted(event);
      onClose();
      toast({ title: t('calendar.eventDetail.eventDeleted') });
    } catch {
      toast({ variant: 'destructive', title: t('calendar.eventDetail.failedDeleteEvent') });
    }
  };

  const toggleDay = (day: number) => {
    if (!draft) return;
    setDraft(d => d ? {
      ...d,
      selectedDays: d.selectedDays.includes(day)
        ? d.selectedDays.filter(x => x !== day)
        : [...d.selectedDays, day],
    } : d);
  };

  const active = draft ?? {
    type: block.type as CalendarBlockType,
    title: block.title ?? '',
    description: block.description ?? '',
    date: block.date ?? event.date,
    startTime: block.startTime ?? event.startTime,
    endTime: block.endTime ?? event.endTime,
    isRecurring: block.isRecurring ?? false,
    selectedDays: block.recurrenceRule?.daysOfWeek ?? [],
    endDate: block.recurrenceEnd ?? '',
  };

  const handleClose = () => {
    setIsEditing(false);
    setDraft(null);
    onClose();
  };

  return (
    <>
    <ClassScopeDialog
      open={scopeDialogOpen}
      mode="delete"
      onClose={() => setScopeDialogOpen(false)}
      onConfirm={confirmDelete}
    />
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {active.title || BLOCK_TYPE_LABELS[active.type]}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Type */}
          <div className="space-y-2">
            <Label>{t("calendar.eventDetail.type")}</Label>
            {isEditing ? (
              <Select value={active.type} onValueChange={(v) => setDraft(d => d ? { ...d, type: v as CalendarBlockType } : d)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">{t("calendar.eventDetail.typePersonal")}</SelectItem>
                  <SelectItem value="break">{t("calendar.eventDetail.typeBreak")}</SelectItem>
                  <SelectItem value="holiday">{t("calendar.eventDetail.typeHoliday")}</SelectItem>
                  <SelectItem value="off_work">{t("calendar.eventDetail.typeOffWork")}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{BLOCK_TYPE_LABELS[active.type]}</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>{t("calendar.eventDetail.title")}</Label>
            {isEditing ? (
              <Input
                placeholder={t("calendar.eventDetail.titlePlaceholder")}
                value={active.title}
                onChange={(e) => setDraft(d => d ? { ...d, title: e.target.value } : d)}
              />
            ) : (
              <p className="text-sm">{active.title || <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>{t("calendar.eventDetail.description")}</Label>
            {isEditing ? (
              <Input
                placeholder={t("calendar.eventDetail.descriptionPlaceholder")}
                value={active.description}
                onChange={(e) => setDraft(d => d ? { ...d, description: e.target.value } : d)}
              />
            ) : (
              <p className="text-sm">{active.description || <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>

          <Separator />

          {/* Date & Time */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {isEditing ? (
                <Input
                  type="date"
                  value={active.date}
                  onChange={(e) => setDraft(d => d ? { ...d, date: e.target.value } : d)}
                />
              ) : (
                <span>{format(new Date(active.date), 'EEEE, MMMM d', { locale: enUS })}</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              {isEditing ? (
                <div className="flex gap-2">
                  <Input type="time" value={active.startTime} onChange={(e) => setDraft(d => d ? { ...d, startTime: e.target.value } : d)} />
                  <Input type="time" value={active.endTime} onChange={(e) => setDraft(d => d ? { ...d, endTime: e.target.value } : d)} />
                </div>
              ) : (
                <span>{active.startTime} – {active.endTime}</span>
              )}
            </div>
          </div>

          {/* Recurring */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-muted-foreground" />
              <Label>{t("calendar.eventDetail.recurring")}</Label>
            </div>
            {isEditing ? (
              <Switch
                checked={active.isRecurring}
                onCheckedChange={(v) => setDraft(d => d ? { ...d, isRecurring: v } : d)}
              />
            ) : (
              <span className="text-sm">{active.isRecurring ? t("calendar.eventDetail.yes") : t("calendar.eventDetail.no")}</span>
            )}
          </div>

          {isEditing && active.isRecurring && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="space-y-2">
                <Label>{t("calendar.eventDetail.daysOfWeek")}</Label>
                <div className="flex gap-1 p-1 rounded-lg">
                  {DAYS_OF_WEEK.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleDay(value)}
                      className={cn(
                        'w-9 h-9 rounded-full text-sm font-medium transition-colors',
                        active.selectedDays.includes(value) ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted-foreground/10'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("calendar.eventDetail.endDate")}</Label>
                <Input
                  type="date"
                  value={active.endDate}
                  onChange={(e) => setDraft(d => d ? { ...d, endDate: e.target.value } : d)}
                />
              </div>
            </div>
          )}

          <Separator />

          {!isEditing ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={startEdit}>
                <Edit className="w-4 h-4 mr-2" />
                {t("common.edit")}
              </Button>
              <Button variant="outline" className="text-destructive" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={cancelEdit} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                {t("common.cancel")}
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? t("calendar.eventDetail.saving") : t("common.save")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
