import * as React from "react";
import { Pressable, View } from "react-native";
import { addMonths, format, parseISO } from "date-fns";
import type { AvailabilityBlocker, BlockerInput } from "@levelup/api/src/resources/availability";
import { availabilityBlockerSchema } from "@levelup/validation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { cn } from "@/lib/utils";

/** The backend always stores student blockers as type "unavailable" (web has
 * no type control either), so the payload is exactly the shared BlockerInput. */
export type BlockerPayload = BlockerInput;

/** All student blockers are backend-forced to "unavailable"; mirrors web's
 * static badge text (AvailabilityPage.tsx). */
export function blockerTypeLabel(_type: string | null | undefined): string {
  return "Unavailable";
}

const DAYS_OF_WEEK = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Maestro constraint: plain text inputs for date/time, validated with zod on
// top of the shared availabilityBlockerSchema (which only requires a date).
const blockerFormSchema = availabilityBlockerSchema.extend({
  date: z.string().regex(DATE_RE, "Date must be in YYYY-MM-DD format"),
  startTime: z.string().regex(TIME_RE, "Start time must be in HH:MM format"),
  endTime: z.string().regex(TIME_RE, "End time must be in HH:MM format"),
  endDate: z
    .string()
    .regex(DATE_RE, "Repeat until must be in YYYY-MM-DD format")
    .optional()
    .or(z.literal("")),
});

interface BlockerFormProps {
  /** When set, the form edits this blocker; otherwise it creates a new one. */
  initial?: AvailabilityBlocker | null;
  saving?: boolean;
  onSubmit: (payload: BlockerPayload) => void;
  onCancel: () => void;
}

export function BlockerForm({
  initial,
  saving = false,
  onSubmit,
  onCancel,
}: BlockerFormProps) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [date, setDate] = React.useState(initial?.date ?? "");
  const [startTime, setStartTime] = React.useState(
    initial?.startTime ?? "18:00"
  );
  const [endTime, setEndTime] = React.useState(initial?.endTime ?? "20:00");
  const [isRecurring, setIsRecurring] = React.useState(
    initial?.isRecurring ?? false
  );
  const [selectedDays, setSelectedDays] = React.useState<number[]>(
    initial?.recurrenceRule?.daysOfWeek ?? []
  );
  const [endDate, setEndDate] = React.useState(initial?.recurrenceEnd ?? "");
  const [formError, setFormError] = React.useState<string | null>(null);

  const toggleDay = (day: number) => {
    setSelectedDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day]
    );
  };

  const handleSave = () => {
    const parsed = blockerFormSchema.safeParse({
      title: title || null,
      date,
      startTime,
      endTime,
      isRecurring,
      endDate: isRecurring ? endDate : "",
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid form");
      return;
    }
    setFormError(null);

    // Default a recurring blocker to the weekday of the chosen date (web).
    let days = selectedDays;
    if (isRecurring && days.length === 0) {
      days = [parseISO(date).getDay()];
    }

    onSubmit({
      title: title || null,
      date,
      startTime,
      endTime,
      isRecurring,
      recurrenceRule: isRecurring
        ? { frequency: "weekly", daysOfWeek: days }
        : null,
      endDate: isRecurring
        ? endDate || format(addMonths(parseISO(date), 3), "yyyy-MM-dd")
        : null,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initial ? "Edit blocker" : "New blocker"}</CardTitle>
        <CardDescription>
          Choose a one-time date or a recurring weekly pattern.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
        <View className="gap-2">
          <Label>Title (optional)</Label>
          <Input
            testID="blocker-title"
            accessibilityLabel="Blocker title"
            placeholder="e.g. Away for work"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <Label>Recurring weekly</Label>
          <Switch
            testID="blocker-recurring-switch"
            accessibilityLabel="Recurring weekly"
            checked={isRecurring}
            onCheckedChange={setIsRecurring}
          />
        </View>

        {isRecurring ? (
          <View className="gap-2">
            <Label>Days of the week</Label>
            <View className="flex-row gap-1.5">
              {DAYS_OF_WEEK.map(({ value, label }, index) => (
                <Pressable
                  key={`${value}-${index}`}
                  role="button"
                  accessibilityLabel={`Toggle day ${index + 1}`}
                  onPress={() => toggleDay(value)}
                  className={cn(
                    "h-9 w-9 items-center justify-center rounded-full",
                    selectedDays.includes(value) ? "bg-primary" : "bg-muted"
                  )}
                >
                  <Text
                    className={cn(
                      "text-sm font-medium",
                      selectedDays.includes(value)
                        ? "text-primary-foreground"
                        : "text-foreground"
                    )}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <DatePickerInput
          testID="blocker-date"
          label="Date"
          value={date}
          onChange={setDate}
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <TimePickerInput
              testID="blocker-start-time"
              label="Start time"
              value={startTime}
              onChange={setStartTime}
            />
          </View>
          <View className="flex-1">
            <TimePickerInput
              testID="blocker-end-time"
              label="End time"
              value={endTime}
              onChange={setEndTime}
            />
          </View>
        </View>

        {isRecurring ? (
          <DatePickerInput
            testID="blocker-end-date"
            label="Repeat until (optional)"
            value={endDate}
            onChange={setEndDate}
          />
        ) : null}

        {formError ? (
          <Text className="text-sm text-destructive">{formError}</Text>
        ) : null}

        <View className="gap-2">
          <Button
            testID="blocker-save"
            accessibilityLabel="Save blocker"
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? <Spinner size="small" color="white" /> : null}
            <Text>{saving ? "Saving..." : "Save"}</Text>
          </Button>
          <Button
            variant="outline"
            accessibilityLabel="Cancel blocker form"
            disabled={saving}
            onPress={onCancel}
          >
            <Text>Cancel</Text>
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}
