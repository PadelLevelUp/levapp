import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReminderConfig, ReminderTiming } from "@/types";

interface RemindersSectionProps {
  reminderTiming: ReminderConfig;
  onChange: (reminderTiming: ReminderConfig) => void;
  disabled?: boolean;
}

function TimingSelector({
  value,
  onChange,
  label,
  description,
  disabled,
}: {
  value: ReminderTiming;
  onChange: (v: ReminderTiming) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  const mode = value.type;

  const setMode = (newMode: "hours_before" | "days_before_at_time") => {
    if (newMode === "hours_before") {
      onChange({ type: "hours_before", value: mode === "hours_before" ? (value as { type: "hours_before"; value: number }).value : 48 });
    } else {
      onChange({ type: "days_before_at_time", days: mode === "days_before_at_time" ? (value as { type: "days_before_at_time"; days: number; time: string }).days : 2, time: mode === "days_before_at_time" ? (value as { type: "days_before_at_time"; days: number; time: string }).time : "17:00" });
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={mode} onValueChange={(v) => setMode(v as "hours_before" | "days_before_at_time")} disabled={disabled}>
          <SelectTrigger className="w-[200px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hours_before">Hours before class</SelectItem>
            <SelectItem value="days_before_at_time">Days before at specific time</SelectItem>
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
            <span className="text-xs text-muted-foreground">hours</span>
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
              <span className="text-xs text-muted-foreground">days at</span>
            </div>
            <input
              type="time"
              value={(value as { type: "days_before_at_time"; days: number; time: string }).time}
              onChange={(e) => onChange({ ...(value as { type: "days_before_at_time"; days: number; time: string }), time: e.target.value })}
              disabled={disabled}
              className="h-7 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function RemindersSection({ reminderTiming, onChange, disabled }: RemindersSectionProps) {
  const update = (patch: Partial<ReminderConfig>) => {
    onChange({ ...reminderTiming, ...patch });
  };

  return (
    <div className={`space-y-5 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <TimingSelector
        value={reminderTiming.firstReminder}
        onChange={(firstReminder) => update({ firstReminder })}
        label="First reminder timing"
        description="When to send the first attendance reminder before class."
        disabled={disabled}
      />

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Reminders per student</p>
        <p className="text-xs text-muted-foreground">
          How many reminders to send if the student doesn't respond.
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
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Hours between reminders</p>
          <p className="text-xs text-muted-foreground">
            How long to wait before sending the next reminder.
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
            <span className="text-xs text-muted-foreground">hours</span>
          </div>
        </div>
      )}

      <TimingSelector
        value={reminderTiming.invitationStart}
        onChange={(invitationStart) => update({ invitationStart })}
        label="Start invitations"
        description="When to begin inviting replacements for open spots."
        disabled={disabled}
      />
    </div>
  );
}
