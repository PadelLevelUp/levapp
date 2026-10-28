import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { ReminderConfig, ReminderTiming } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { cn } from "@/lib/utils";

/**
 * PAD-776 part 3 (notifications.config rules 5 and 10d): the port of web's RemindersSection — the
 * first reminder, reminders per student, hours between them and when invitations start, with web's
 * bounds, defaults and labels. A controlled form: each change goes to the engine card at once,
 * which holds it with the rest of the card until the screen's Save (settings.explicit-save).
 *
 * Web's mode Select is a two-option segmented control here, as the card's invitation mode is.
 */
interface RemindersSectionProps {
  reminderTiming: ReminderConfig;
  onChange: (reminderTiming: ReminderConfig) => void;
  disabled?: boolean;
}

/** Web's defaults, for a config saved before these keys existed (NotificationsEngineSection). */
export const REMINDER_FALLBACKS: ReminderConfig = {
  firstReminder: { type: "hours_before", value: 48 },
  reminderCount: 1,
  hoursBetweenReminders: 4,
  invitationStart: { type: "hours_before", value: 24 },
};

type HoursBefore = Extract<ReminderTiming, { type: "hours_before" }>;
type DaysBefore = Extract<ReminderTiming, { type: "days_before_at_time" }>;

function Stepper({
  testID,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  testID: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const button = (direction: 1 | -1) => {
    const off = !!disabled || (direction > 0 ? value >= max : value <= min);
    return (
      <Pressable
        testID={`${testID}-${direction > 0 ? "inc" : "dec"}`}
        accessibilityRole="button"
        accessibilityLabel={direction > 0 ? "+" : "−"}
        accessibilityState={{ disabled: off }}
        disabled={off}
        onPress={() => onChange(Math.min(max, Math.max(min, value + direction)))}
        hitSlop={6}
        className={cn(
          "h-8 w-8 items-center justify-center rounded-md border border-input bg-background",
          off && "opacity-40"
        )}
      >
        <Ionicons name={direction > 0 ? "add" : "remove"} size={16} color={lightTheme.foreground} />
      </Pressable>
    );
  };
  return (
    <View className="flex-row items-center gap-1">
      {button(-1)}
      <Text testID={`${testID}-value`} className="w-10 text-center text-sm font-semibold">
        {String(value)}
      </Text>
      {button(1)}
      {unit ? <Text className="ml-1 text-xs text-muted-foreground">{unit}</Text> : null}
    </View>
  );
}

function Field({ testID, label, description, children }: {
  testID: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5" testID={testID}>
      <Text className="text-sm font-medium">{label}</Text>
      <Text className="text-xs text-muted-foreground">{description}</Text>
      {children}
    </View>
  );
}

function TimingSelector({
  value,
  onChange,
  label,
  description,
  disabled,
  testID,
}: {
  value: ReminderTiming;
  onChange: (v: ReminderTiming) => void;
  label: string;
  description: string;
  disabled?: boolean;
  testID: string;
}) {
  const { t } = useTranslation();
  const mode = value.type;

  // Web's switch: the other mode starts from its own defaults (48 h; 2 days at 17:00).
  const setMode = (next: ReminderTiming["type"]) => {
    if (next === mode) return;
    onChange(next === "hours_before"
      ? { type: "hours_before", value: 48 }
      : { type: "days_before_at_time", days: 2, time: "17:00" });
  };

  return (
    <Field testID={testID} label={label} description={description}>
      <View className="flex-row gap-2">
        {(
          [
            ["hours_before", t("settings.reminders.hoursBeforeClass"), "hours"],
            ["days_before_at_time", t("settings.reminders.daysBeforeAtTime"), "days"],
          ] as [ReminderTiming["type"], string, string][]
        ).map(([option, optionLabel, suffix]) => {
          const selected = mode === option;
          return (
            <Pressable
              key={option}
              testID={`${testID}-mode-${suffix}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !!disabled }}
              accessibilityLabel={optionLabel}
              disabled={disabled}
              onPress={() => setMode(option)}
              className={cn(
                "flex-1 items-center rounded-md border px-2 py-2",
                selected ? "border-primary bg-primary/10" : "border-input bg-background",
                disabled && "opacity-40"
              )}
            >
              <Text className={cn("text-xs font-medium", selected ? "text-primary" : "text-foreground")}>
                {optionLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {mode === "hours_before" ? (
        <Stepper
          testID={`${testID}-hours`}
          value={(value as HoursBefore).value}
          min={1}
          max={168}
          unit={t("settings.reminders.hours")}
          disabled={disabled}
          onChange={(hours) => onChange({ type: "hours_before", value: hours })}
        />
      ) : (
        <View className="flex-row flex-wrap items-center gap-2">
          <Stepper
            testID={`${testID}-days`}
            value={(value as DaysBefore).days}
            min={1}
            max={30}
            unit={t("settings.reminders.daysAt")}
            disabled={disabled}
            onChange={(days) => onChange({ ...(value as DaysBefore), days })}
          />
          <View className="w-24">
            {/* Web's TimeSelect offers 00:00–23:45 on a 15-minute grid. */}
            <TimePickerInput
              testID={`${testID}-time`}
              value={(value as DaysBefore).time}
              onChange={(time) => onChange({ ...(value as DaysBefore), time })}
              minuteInterval={15}
              disabled={disabled}
            />
          </View>
        </View>
      )}
    </Field>
  );
}

export function RemindersSection({ reminderTiming, onChange, disabled }: RemindersSectionProps) {
  const { t } = useTranslation();
  const update = (patch: Partial<ReminderConfig>) => onChange({ ...reminderTiming, ...patch });

  return (
    <View className={cn("gap-5", disabled && "opacity-40")} pointerEvents={disabled ? "none" : "auto"}>
      <TimingSelector
        testID="reminder-first-reminder-timing"
        value={reminderTiming.firstReminder}
        onChange={(firstReminder) => update({ firstReminder })}
        label={t("settings.reminders.firstReminderTiming")}
        description={t("settings.reminders.firstReminderDescription")}
        disabled={disabled}
      />

      <Field
        testID="reminder-per-student"
        label={t("settings.reminders.remindersPerStudent")}
        description={t("settings.reminders.remindersPerStudentDescription")}
      >
        <Stepper
          testID="reminder-per-student-count"
          value={reminderTiming.reminderCount}
          min={1}
          max={5}
          disabled={disabled}
          onChange={(reminderCount) => update({ reminderCount })}
        />
      </Field>

      {reminderTiming.reminderCount > 1 ? (
        <Field
          testID="reminder-hours-between"
          label={t("settings.reminders.hoursBetween")}
          description={t("settings.reminders.hoursBetweenDescription")}
        >
          <Stepper
            testID="reminder-hours-between-count"
            value={reminderTiming.hoursBetweenReminders}
            min={1}
            max={24}
            unit={t("settings.reminders.hours")}
            disabled={disabled}
            onChange={(hoursBetweenReminders) => update({ hoursBetweenReminders })}
          />
        </Field>
      ) : null}

      <TimingSelector
        testID="reminder-start-invitations"
        value={reminderTiming.invitationStart}
        onChange={(invitationStart) => update({ invitationStart })}
        label={t("settings.reminders.startInvitations")}
        description={t("settings.reminders.startInvitationsDescription")}
        disabled={disabled}
      />
    </View>
  );
}
