import * as React from "react";
import { useTranslation } from "react-i18next";
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
export function blockerTypeLabel(
  _type: string | null | undefined,
  t: (key: string) => string
): string {
  return t("availability.unavailable");
}

// Monday-first order; the label/name come from availability.dayInitials.<n>
// and availability.days.<n>, both keyed by JS getDay().
const DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 0];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Maestro constraint: plain text inputs for date/time, validated with zod on
// top of the shared availabilityBlockerSchema (which only requires a date).
const blockerFormSchema = availabilityBlockerSchema.extend({
  date: z.string().regex(DATE_RE, "availability.validation.dateFormat"),
  startTime: z.string().regex(TIME_RE, "availability.validation.startTimeFormat"),
  endTime: z.string().regex(TIME_RE, "availability.validation.endTimeFormat"),
  endDate: z
    .string()
    .regex(DATE_RE, "availability.validation.repeatUntilFormat")
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
  const { t } = useTranslation();
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
      // Messages are i18n keys (see blockerFormSchema); anything coming from
      // the shared schema is not a key and falls back to its own English text.
      const raw =
        parsed.error.issues[0]?.message ?? "availability.validation.invalidForm";
      setFormError(t(raw, { defaultValue: raw }));
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
        <CardTitle>
          {initial ? t("availability.editBlocker") : t("availability.newBlocker")}
        </CardTitle>
        <CardDescription>{t("availability.formDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
        <View className="gap-2">
          <Label>{t("availability.titleLabel")}</Label>
          <Input
            testID="blocker-title"
            accessibilityLabel={t("availability.blockerTitleAria")}
            placeholder={t("availability.titlePlaceholder")}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <Label>{t("availability.recurringWeekly")}</Label>
          <Switch
            testID="blocker-recurring-switch"
            accessibilityLabel={t("availability.recurringWeekly")}
            checked={isRecurring}
            onCheckedChange={setIsRecurring}
          />
        </View>

        {isRecurring ? (
          <View className="gap-2">
            <Label>{t("availability.daysOfWeek")}</Label>
            <View className="flex-row gap-1.5">
              {DAYS_OF_WEEK.map((value, index) => (
                <Pressable
                  key={`${value}-${index}`}
                  role="button"
                  accessibilityLabel={t("availability.toggleDayAria", {
                    day: t(`availability.days.${value}`),
                  })}
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
                    {t(`availability.dayInitials.${value}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <DatePickerInput
          testID="blocker-date"
          label={t("availability.date")}
          value={date}
          onChange={setDate}
        />

        <View className="flex-row gap-3">
          <View className="flex-1">
            <TimePickerInput
              testID="blocker-start-time"
              label={t("availability.startTime")}
              value={startTime}
              onChange={setStartTime}
            />
          </View>
          <View className="flex-1">
            <TimePickerInput
              testID="blocker-end-time"
              label={t("availability.endTime")}
              value={endTime}
              onChange={setEndTime}
            />
          </View>
        </View>

        {isRecurring ? (
          <DatePickerInput
            testID="blocker-end-date"
            label={t("availability.repeatUntil")}
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
            accessibilityLabel={t("availability.saveBlockerAria")}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? <Spinner size="small" color="white" /> : null}
            <Text>{saving ? t("availability.saving") : t("common.save")}</Text>
          </Button>
          <Button
            variant="outline"
            accessibilityLabel={t("availability.cancelFormAria")}
            disabled={saving}
            onPress={onCancel}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}
