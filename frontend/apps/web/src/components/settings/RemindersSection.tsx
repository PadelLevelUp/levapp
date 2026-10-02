import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReminderConfig, ReminderTiming } from "@/types";
import { useFlushOnPageHide } from "@/components/evaluations/useFlushOnPageHide";
import { createPausedSaver, type PausedSaver } from "./pausedSaver";

/** How long the coach must stop tapping or typing before the timing is sent (PAD-478). */
export const REMINDERS_SAVE_DELAY_MS = 600;

interface RemindersSectionProps {
  reminderTiming: ReminderConfig;
  /** Called ONCE per edit, with the final value. May return the save's promise, so the
   *  next save waits for it (notifications.config rule 10d). */
  onChange: (reminderTiming: ReminderConfig) => void | Promise<unknown>;
  disabled?: boolean;
  /** Asked when the section closes with an edit still inside its pause: send it (the default),
   *  or drop it. The card answers "drop" when there is no session any more, so an edit made
   *  just before sign-out is never sent (settings.save-on-change, review #497). */
  flushOnClose?: () => boolean;
}

function TimingSelector({
  value,
  onChange,
  onCommit,
  label,
  description,
  disabled,
  testId,
}: {
  value: ReminderTiming;
  onChange: (v: ReminderTiming) => void;
  /** The coach left a field: send what is pending now. */
  onCommit: () => void;
  label: string;
  description: string;
  disabled?: boolean;
  testId?: string;
}) {
  const { t } = useTranslation();
  const mode = value.type;

  const setMode = (newMode: "hours_before" | "days_before_at_time") => {
    if (newMode === "hours_before") {
      onChange({ type: "hours_before", value: mode === "hours_before" ? (value as { type: "hours_before"; value: number }).value : 48 });
    } else {
      onChange({ type: "days_before_at_time", days: mode === "days_before_at_time" ? (value as { type: "days_before_at_time"; days: number; time: string }).days : 2, time: mode === "days_before_at_time" ? (value as { type: "days_before_at_time"; days: number; time: string }).time : "17:00" });
    }
  };

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={mode} onValueChange={(v) => setMode(v as "hours_before" | "days_before_at_time")} disabled={disabled}>
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hours_before">{t("settings.reminders.hoursBeforeClass")}</SelectItem>
            <SelectItem value="days_before_at_time">{t("settings.reminders.daysBeforeAtTime")}</SelectItem>
          </SelectContent>
        </Select>

        {mode === "hours_before" && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || (value as { type: "hours_before"; value: number }).value <= 1}
              onClick={() => onChange({ type: "hours_before", value: Math.max(1, (value as { type: "hours_before"; value: number }).value - 1) })}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-sm font-semibold w-8 text-center">
              {(value as { type: "hours_before"; value: number }).value}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || (value as { type: "hours_before"; value: number }).value >= 168}
              onClick={() => onChange({ type: "hours_before", value: Math.min(168, (value as { type: "hours_before"; value: number }).value + 1) })}
            >
              <Plus className="w-3 h-3" />
            </Button>
            <span className="text-xs text-muted-foreground">{t("settings.reminders.hours")}</span>
          </div>
        )}

        {mode === "days_before_at_time" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={disabled || (value as { type: "days_before_at_time"; days: number; time: string }).days <= 1}
                onClick={() => onChange({ ...(value as { type: "days_before_at_time"; days: number; time: string }), days: Math.max(1, (value as { type: "days_before_at_time"; days: number; time: string }).days - 1) })}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm font-semibold w-8 text-center">
                {(value as { type: "days_before_at_time"; days: number; time: string }).days}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={disabled || (value as { type: "days_before_at_time"; days: number; time: string }).days >= 30}
                onClick={() => onChange({ ...(value as { type: "days_before_at_time"; days: number; time: string }), days: Math.min(30, (value as { type: "days_before_at_time"; days: number; time: string }).days + 1) })}
              >
                <Plus className="w-3 h-3" />
              </Button>
              <span className="text-xs text-muted-foreground">{t("settings.reminders.daysAt")}</span>
            </div>
            <input
              type="time"
              value={(value as { type: "days_before_at_time"; days: number; time: string }).time}
              onChange={(e) => onChange({ ...(value as { type: "days_before_at_time"; days: number; time: string }), time: e.target.value })}
              onBlur={onCommit}
              disabled={disabled}
              className="h-7 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function RemindersSection({ reminderTiming: saved, onChange, disabled, flushOnClose }: RemindersSectionProps) {
  const { t } = useTranslation();

  // PAD-478 (notifications.config rule 10d): the controls show each tap or keystroke at once
  // from a local draft, and the timing is SENT once, after the coach pauses (or leaves the
  // time field, or closes the section), with the final value. Before, every stepper tap and
  // every segment edit of the time field was a save, and each save re-armed every future job.
  const [draft, setDraft] = useState<ReminderConfig>(saved);
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Bumped when a save settles, so the draft is compared with the saved value again then.
  const [settled, setSettled] = useState(0);
  const saverRef = useRef<PausedSaver<ReminderConfig> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createPausedSaver<ReminderConfig>({
      delayMs: REMINDERS_SAVE_DELAY_MS,
      send: (value) => {
        const result = onChangeRef.current(value);
        const bump = () => setSettled((n) => n + 1);
        Promise.resolve(result).then(bump, bump);
        return result;
      },
    });
  }
  const saver = saverRef.current;

  // The saved value wins whenever the coach is not in the middle of an edit: after a save
  // is confirmed, and after a failed one that the parent rolled back.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (saver.busy()) return;
    draftRef.current = saved;
    setDraft(saved);
    // `saved` is a new object on every parent render; its content is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, saver, settled]);

  // Closing the section must not lose an edit that is still inside its pause, unless the
  // user has signed out: then it is dropped, with whatever was waiting to be sent.
  const flushOnCloseRef = useRef(flushOnClose);
  flushOnCloseRef.current = flushOnClose;
  useEffect(
    () => () => {
      if (flushOnCloseRef.current?.() === false) saver.dispose();
      else saver.flush();
    },
    [saver],
  );

  // A tab closed or switched away while an edit is still inside its pause: send it now. The
  // request is an ordinary one, so on a tab that is closing it may not leave; on a tab that
  // is only hidden it does (notifications.config rule 10d states the limit).
  useFlushOnPageHide(() => saver.flush());

  const reminderTiming = draft;
  const update = (patch: Partial<ReminderConfig>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    saver.push(next);
  };

  return (
    <div className={`space-y-5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <TimingSelector
        value={reminderTiming.firstReminder}
        onChange={(firstReminder) => update({ firstReminder })}
        onCommit={saver.flush}
        label={t("settings.reminders.firstReminderTiming")}
        description={t("settings.reminders.firstReminderDescription")}
        disabled={disabled}
        testId="reminder-first-reminder-timing"
      />

      <div className="space-y-1.5" data-testid="reminder-per-student">
        <p className="text-sm font-medium">{t("settings.reminders.remindersPerStudent")}</p>
        <p className="text-xs text-muted-foreground">
          {t("settings.reminders.remindersPerStudentDescription")}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={disabled || reminderTiming.reminderCount <= 1}
            onClick={() => update({ reminderCount: Math.max(1, reminderTiming.reminderCount - 1) })}
          >
            <Minus className="w-3 h-3" />
          </Button>
          <span className="text-sm font-semibold w-8 text-center">
            {reminderTiming.reminderCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={disabled || reminderTiming.reminderCount >= 5}
            onClick={() => update({ reminderCount: Math.min(5, reminderTiming.reminderCount + 1) })}
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {reminderTiming.reminderCount > 1 && (
        <div className="space-y-1.5" data-testid="reminder-hours-between">
          <p className="text-sm font-medium">{t("settings.reminders.hoursBetween")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.reminders.hoursBetweenDescription")}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || reminderTiming.hoursBetweenReminders <= 1}
              onClick={() => update({ hoursBetweenReminders: Math.max(1, reminderTiming.hoursBetweenReminders - 1) })}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-sm font-semibold w-8 text-center">
              {reminderTiming.hoursBetweenReminders}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={disabled || reminderTiming.hoursBetweenReminders >= 24}
              onClick={() => update({ hoursBetweenReminders: Math.min(24, reminderTiming.hoursBetweenReminders + 1) })}
            >
              <Plus className="w-3 h-3" />
            </Button>
            <span className="text-xs text-muted-foreground">{t("settings.reminders.hours")}</span>
          </div>
        </div>
      )}

      <TimingSelector
        value={reminderTiming.invitationStart}
        onChange={(invitationStart) => update({ invitationStart })}
        onCommit={saver.flush}
        label={t("settings.reminders.startInvitations")}
        description={t("settings.reminders.startInvitationsDescription")}
        disabled={disabled}
        testId="reminder-start-invitations"
      />
    </div>
  );
}
