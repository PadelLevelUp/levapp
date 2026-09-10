import { useState, useEffect, useMemo } from 'react';
import type { Court } from '@/types';
import { listCurrentClubCourts } from '@/api/courts';
import { format, addMonths, addDays, startOfWeek } from 'date-fns';
import { enUS, pt } from 'date-fns/locale';
import { Users, Clock, Calendar, Plus, Minus, Repeat, Bell, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { ClassType, CoachPlayer, CoachLevel, CalendarEvent } from '@/types';
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
import { CLASS_COLOR_SWATCHES, findOverlappingEvent } from "@levelup/config";
import { OverlapConfirmDialog } from './OverlapConfirmDialog';
import { UnavailableStudentDialog } from './UnavailableStudentDialog';
import { checkAvailabilityConflicts, type BlockedStudent } from '@/api/notificationEngine';

const COACH_ID = "1";

/**
 * PAD-90: backend rejection codes this sheet knows how to explain in place.
 * Anything else stays with the caller's generic "creation failed" toast.
 */
export const NO_SEASON_COVERS_DATE = 'no_season_covers_date';

/**
 * Thrown by the `onSave` handler when the backend rejected the create for a
 * reason the coach can fix without losing the form. The sheet stays open and
 * renders the matching message inline instead of closing.
 */
export class AddClassRejected extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'AddClassRejected';
  }
}

interface AddClassSheetProps {
  open: boolean;
  onClose: () => void;
  initialDate?: Date;
  initialTime?: string;
  /**
   * PAD-106: end time pinned by a drag-selected calendar range. When omitted
   * (single slot click, toolbar "Add class") the sheet keeps its own default
   * duration of start + 90 min.
   */
  initialEndTime?: string;
  onSave?: (data: any) => void | Promise<void>;
  players: CoachPlayer[];
  levels: CoachLevel[];
  loading?: boolean;
  /** Events already loaded for the visible week — used to warn on overlap (PAD-99). */
  existingEvents?: CalendarEvent[];
}

// PAD-246: one shared palette for every picker — calendar.mobile-views rule 6.
const COLORS: readonly string[] = CLASS_COLOR_SWATCHES;

// Monday..Sunday order (date-fns getDay() values: Mon=1 … Sat=6, Sun=0).
// Keep this ORDER stable — only the locale-aware initial label changes per language.
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0];

/** How long a class lasts when nothing says otherwise. */
const DEFAULT_DURATION_MIN = 90;

/** `start` + 90 min, clamped to the same day — the sheet's long-standing default. */
function defaultEndTime(start: string) {
  const [h, m] = start.split(':').map(Number);
  const totalMin = h * 60 + m + DEFAULT_DURATION_MIN;
  const newH = Math.min(Math.floor(totalMin / 60), 23);
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function AddClassSheet({
  open,
  onClose,
  initialDate,
  initialTime,
  initialEndTime,
  onSave,
  players,
  levels,
  loading = false,
  existingEvents = [],
}: AddClassSheetProps) {
  const { t, i18n } = useTranslation();
  const autoInviteEnabled = useAutoInviteEnabled(open);
  // Locale-aware weekday initials (e.g. PT: S/T/Q/Q/S/S/D), derived from date-fns
  // rather than hardcoded — keeps the Mon..Sun rendering order identical.
  const daysOfWeek = useMemo(() => {
    const dateFnsLocale = i18n.language === 'pt' ? pt : enUS;
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    return WEEKDAY_VALUES.map((value, index) => ({
      value,
      label: format(addDays(weekStart, index), 'EEEEE', { locale: dateFnsLocale }).toUpperCase(),
    }));
  }, [i18n.language]);
  const [classType, setClassType] = useState<ClassType>('academy');
  const [isRecurring, setIsRecurring] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(
    initialDate ? format(initialDate, 'yyyy-MM-dd', { locale: enUS }) : ''
  );
  const [startTime, setStartTime] = useState(initialTime || '09:00');
  const [endTime, setEndTime] = useState(
    initialEndTime || defaultEndTime(initialTime || '09:00')
  );
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  // clubs.courts rule 7 (PAD-194): the coach's current club's courts.
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<string>('');
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCurrentClubCourts()
      .then((rows) => {
        if (!cancelled) setCourts(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState<string>('');
  const [recursUntilSeasonEnd, setRecursUntilSeasonEnd] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  // PAD-99: confirm before scheduling over an existing class.
  const [overlapConfirmOpen, setOverlapConfirmOpen] = useState(false);
  // PAD-107: confirm before scheduling a student into a window they marked as
  // unavailable. Non-empty means the warning dialog is open.
  const [unavailableStudents, setUnavailableStudents] = useState<BlockedStudent[]>([]);
  // Set once the coach has confirmed, so re-submitting doesn't ask twice.
  const [unavailableAcknowledged, setUnavailableAcknowledged] = useState(false);
  // PAD-90: a server-side rejection the coach can act on, shown inline.
  const [rejection, setRejection] = useState<string | null>(null);
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
    const nextStart = initialTime || '09:00';
    setStartTime(nextStart);
    // PAD-106: a dragged range pins the end time; anything else falls back to the
    // default duration. Always assigning it (rather than only when pinned) keeps
    // reopening the sheet deterministic — otherwise the end time of a previous
    // drag would leak into the next single-slot click.
    setEndTime(initialEndTime || defaultEndTime(nextStart));
  }, [open, initialDate, initialTime, initialEndTime]);

  useEffect(() => {
    if (!isRecurring || !date) return;
    const weekday = new Date(date).getDay();
    setSelectedDays(prev => prev.includes(weekday) ? prev : [weekday, ...prev]);
  }, [isRecurring, date]);

  // PAD-107: a confirmation only covers the slot/roster it was given for —
  // changing the date, time or participants must ask again.
  useEffect(() => {
    setUnavailableAcknowledged(false);
  }, [date, startTime, endTime, selectedPlayers]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  useEffect(() => {
    if (!startTime) return;
    if (endTime <= startTime) {
      setEndTime(defaultEndTime(startTime));
    }
  }, [startTime]);

  const handleSave = async () => {
    const newErrors: Record<string, boolean> = {};
    if (!date) newErrors.date = true;
    if (isRecurring && selectedDays.length === 0) newErrors.days = true;
    if (isRecurring && !recursUntilSeasonEnd && !endDate) newErrors.endDate = true;

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
    setRejection(null);

    // PAD-99: non-blocking overlap warning. For a recurring class we only check
    // the first occurrence's date (the calendar only holds the visible week's
    // events client-side); the coach can still proceed either way.
    const conflict = findOverlappingEvent(
      { date, startTime, endTime },
      existingEvents
    );
    if (conflict) {
      setOverlapConfirmOpen(true);
      return;
    }

    await checkUnavailableThenSave();
  };

  /**
   * PAD-107: warn before booking a student into a window they marked as
   * unavailable. Like the overlap warning this never hard-blocks — the coach
   * decides — but they are told that no notification can reach that student for
   * this slot. For a recurring class only the first occurrence is checked
   * (same scope as the overlap warning).
   */
  const checkUnavailableThenSave = async () => {
    setOverlapConfirmOpen(false);

    if (
      !unavailableAcknowledged &&
      selectedPlayers.length > 0 &&
      date &&
      startTime &&
      endTime
    ) {
      try {
        const blocked = await checkAvailabilityConflicts(
          date,
          startTime,
          endTime,
          selectedPlayers
        );
        if (blocked.length > 0) {
          setUnavailableStudents(blocked);
          return;
        }
      } catch {
        // A failed availability lookup must never stop a coach from booking.
        // The send-time block on the backend is the real guarantee.
      }
    }

    await proceedSave();
  };

  // Async because PAD-90 awaits onSave to catch AddClassRejected; PAD-99 split
  // this out of handleSave so the overlap dialog can call it directly.
  const proceedSave = async () => {
    setOverlapConfirmOpen(false);
    setUnavailableStudents([]);

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
      courtId: selectedCourt ? Number(selectedCourt) : null,
      playerIds: selectedPlayers,
      notificationsEnabled,
      recurrenceRule: isRecurring
        ? { frequency: 'weekly', daysOfWeek: selectedDays }
        : null,
      recursUntilSeasonEnd: isRecurring ? recursUntilSeasonEnd : false,
      endDate: recursUntilSeasonEnd ? null : computedEndDate,
    };

    // PAD-90: the save is awaited so a rejection the coach can fix (e.g. "recurs
    // until season end" with no covering season) keeps the sheet — and every
    // field they filled in — on screen instead of closing over a silent failure.
    try {
      await onSave?.(data);
    } catch (err) {
      if (err instanceof AddClassRejected) {
        setRejection(err.reason);
        return;
      }
      // Anything else was already surfaced by the caller.
    }

    handleClose();
  };

  const handleClose = () => {
    setOverlapConfirmOpen(false);
    setUnavailableStudents([]);
    setUnavailableAcknowledged(false);
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
    setRecursUntilSeasonEnd(false);
    setSelectedCourt('');
    setNotificationsEnabled(true);
    setErrors({});
    setRejection(null);
    onClose();
  };

  return (
    <>
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
                onChange={(e) => { setDate(e.target.value); setErrors(er => ({ ...er, date: false })); setRejection(null); }}
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

          {/* Court (clubs.courts rule 7, PAD-194) */}
          {courts.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-xs font-medium">{t("calendar.addClass.court")}</span>
              </div>
              <Select value={selectedCourt || 'none'} onValueChange={(v) => setSelectedCourt(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-8 text-sm" data-testid="add-class-court" aria-label={t("calendar.addClass.court")}>
                  <SelectValue placeholder={t("calendar.addClass.noCourt")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("calendar.addClass.noCourt")}</SelectItem>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={String(court.id)}>
                      {court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Recurring */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{t("calendar.addClass.recurring")}</span>
              </div>
              <Switch aria-label={t("calendar.addClass.recurring")} checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
            {isRecurring && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.daysOfWeek")}</span>
                  <div className={cn("flex gap-1", errors.days && "ring-2 ring-destructive rounded-lg p-0.5")}>
                    {daysOfWeek.map(({ value, label }) => (
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
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.recursUntilSeasonEnd")}</span>
                  <Switch
                    aria-label={t("calendar.addClass.recursUntilSeasonEnd")}
                    checked={recursUntilSeasonEnd}
                    onCheckedChange={(checked) => {
                      setRecursUntilSeasonEnd(checked);
                      setRejection(null);
                    }}
                  />
                </div>
                {rejection === NO_SEASON_COVERS_DATE && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    {t("calendar.addClass.noSeasonCoversDate")}
                  </p>
                )}
                {recursUntilSeasonEnd ? (
                  <p className="text-xs text-muted-foreground">
                    {t("calendar.addClass.recursUntilSeasonEndHint")}
                  </p>
                ) : (
                  <div className={cn("space-y-1", errors.endDate && "ring-2 ring-destructive rounded-lg p-1")}>
                    <span className="text-xs font-medium text-muted-foreground">{t("calendar.addClass.endDate")}</span>
                    <Input
                      type="date"
                      value={endDate}
                      className="h-8 text-sm"
                      onChange={(e) => { setEndDate(e.target.value); setErrors(er => ({ ...er, endDate: false })); }}
                    />
                  </div>
                )}
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
    <OverlapConfirmDialog
      open={overlapConfirmOpen}
      onCancel={() => setOverlapConfirmOpen(false)}
      onConfirm={checkUnavailableThenSave}
    />
    <UnavailableStudentDialog
      open={unavailableStudents.length > 0}
      students={unavailableStudents}
      onCancel={() => setUnavailableStudents([])}
      onConfirm={() => {
        setUnavailableAcknowledged(true);
        proceedSave();
      }}
    />
    </>
  );
}
