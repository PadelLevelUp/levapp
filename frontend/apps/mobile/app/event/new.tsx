import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { CalendarBlockType } from "@levelup/types";
import { classFormSchema } from "@levelup/validation";
import { addMonths, format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useAddEvent } from "@/features/calendar/hooks";

// Monday-first, matching web's AddEventSheet.
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

const TYPE_VALUES: CalendarBlockType[] = [
  "personal",
  "break",
  "holiday",
  "off_work",
];

type FieldErrors = Partial<
  Record<"date" | "startTime" | "endTime" | "days" | "endDate", string>
>;

export default function NewEventScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ date?: string }>();
  const addEvent = useAddEvent();

  const TYPE_OPTIONS: Option[] = TYPE_VALUES.map((value) => ({
    value,
    label: t(`calendar.addEvent.type${capitalize(value)}`),
  }));

  const initialDate =
    typeof params.date === "string" && DATE_RE.test(params.date)
      ? params.date
      : format(new Date(), "yyyy-MM-dd");

  const [type, setType] = React.useState<Option>(TYPE_OPTIONS[0]);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState(initialDate);
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:00");
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [selectedDays, setSelectedDays] = React.useState<number[]>([]);
  const [endDate, setEndDate] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  // When recurring turns on, pre-select the weekday of the chosen date (web parity).
  React.useEffect(() => {
    if (!isRecurring || !DATE_RE.test(date)) return;
    const weekday = new Date(`${date}T00:00:00`).getDay();
    setSelectedDays((prev) => (prev.includes(weekday) ? prev : [weekday, ...prev]));
  }, [isRecurring, date]);

  // Keep end time after start time (web parity: auto-bump by 60min on change).
  React.useEffect(() => {
    if (!TIME_RE.test(startTime)) return;
    if (endTime <= startTime) {
      const [h, m] = startTime.split(":").map(Number);
      const total = h * 60 + m + 60;
      const newH = Math.min(Math.floor(total / 60), 23);
      const newM = total % 60;
      setEndTime(`${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime]);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setErrors((prev) => ({ ...prev, days: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};

    if (!DATE_RE.test(date)) next.date = t("calendar.addEvent.fieldDate");
    if (!TIME_RE.test(startTime))
      next.startTime = t("ui.validation.useTimeFormat");
    if (!TIME_RE.test(endTime))
      next.endTime = t("ui.validation.useTimeFormat");
    if (isRecurring && endDate && !DATE_RE.test(endDate)) {
      next.endDate = t("ui.validation.useDateFormat");
    }

    // Shared schema: date required; recurring needs days + end date (same
    // rule set as web's AddEventSheet.handleSave, ported via AddClassSheet's schema).
    const result = classFormSchema.safeParse({
      date: DATE_RE.test(date) ? date : "",
      isRecurring,
      daysOfWeek: selectedDays,
      endDate: endDate || null,
    });
    if (!result.success) {
      for (const issue of result.error.errors) {
        const field = issue.path[0];
        if (field === "date" && !next.date) next.date = t("calendar.addEvent.fieldDate");
        if (field === "daysOfWeek") next.days = t("calendar.addEvent.fieldDays");
        if (field === "endDate" && !next.endDate) next.endDate = t("calendar.addEvent.fieldEndDate");
      }
    }

    setErrors(next);
    return Object.values(next).every((value) => !value);
  };

  const handleSave = async () => {
    setFormError(null);
    if (!validate()) return;

    const computedEndDate = isRecurring
      ? endDate || format(addMonths(new Date(`${date}T00:00:00`), 1), "yyyy-MM-dd")
      : null;

    const data = {
      type: (type?.value ?? "personal") as CalendarBlockType,
      title: title || null,
      description: description || null,
      date,
      startTime,
      endTime,
      isRecurring,
      recurrenceRule: isRecurring
        ? { frequency: "weekly", daysOfWeek: selectedDays }
        : null,
      endDate: computedEndDate,
    };

    try {
      await addEvent.mutateAsync(data);
      toast.success(t("calendar.page.eventCreated"));
      router.back();
    } catch {
      setFormError(t("calendar.page.failedCreateEvent"));
      toast.error(t("calendar.page.failedCreateEvent"));
    }
  };

  return (
    <Screen edges={["top"]} testID="event-new">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          testID="event-new-back"
          accessibilityLabel={t("common.back")}
          role="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={22} color={lightTheme.foreground} />
        </Pressable>
        <Text role="heading" aria-level={1} className="flex-1 text-lg font-bold">
          {t("calendar.addEvent.title")}
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 p-4 pb-12"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Type */}
          <View className="gap-1.5">
            <Label>{t("calendar.addEvent.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger
                testID="event-type"
                accessibilityLabel={t("calendar.addEvent.type")}
              >
                <SelectValue placeholder={t("calendar.addEvent.type")} />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option!.value}
                    value={option!.value}
                    label={option!.label}
                  />
                ))}
              </SelectContent>
            </Select>
          </View>

          {/* Title (optional) */}
          <View className="gap-1.5">
            <Label>{t("calendar.addEvent.titleLabel")}</Label>
            <Input
              testID="event-name"
              accessibilityLabel={t("calendar.addEvent.titleLabel")}
              placeholder={t("calendar.addEvent.titlePlaceholder")}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {/* Description (optional) */}
          <View className="gap-1.5">
            <Label>{t("calendar.addEvent.descriptionLabel")}</Label>
            <Input
              testID="event-description"
              accessibilityLabel={t("calendar.addEvent.descriptionLabel")}
              placeholder={t("calendar.addEvent.descriptionPlaceholder")}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Date */}
          <DatePickerInput
            testID="event-date"
            label={
              isRecurring
                ? t("calendar.addEvent.startDate")
                : t("calendar.addEvent.dateShort")
            }
            value={date}
            onChange={(value) => {
              setDate(value);
              setErrors((prev) => ({ ...prev, date: undefined }));
            }}
            error={errors.date}
          />

          {/* Times */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TimePickerInput
                testID="event-start"
                label={
                  isRecurring
                    ? t("calendar.addEvent.startTime")
                    : t("calendar.addEvent.startShort")
                }
                value={startTime}
                onChange={(value) => {
                  setStartTime(value);
                  setErrors((prev) => ({ ...prev, startTime: undefined }));
                }}
                error={errors.startTime}
              />
            </View>
            <View className="flex-1">
              <TimePickerInput
                testID="event-end"
                label={
                  isRecurring
                    ? t("calendar.addEvent.endTime")
                    : t("calendar.addEvent.endShort")
                }
                value={endTime}
                onChange={(value) => {
                  setEndTime(value);
                  setErrors((prev) => ({ ...prev, endTime: undefined }));
                }}
                error={errors.endTime}
              />
            </View>
          </View>

          {/* Recurring */}
          <View className="gap-3 rounded-lg border border-border bg-card p-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Ionicons
                  name="repeat-outline"
                  size={16}
                  color={lightTheme.mutedForeground}
                />
                <Text className="text-sm font-medium">
                  {t("calendar.addEvent.recurring")}
                </Text>
              </View>
              <Switch
                testID="event-recurring-switch"
                accessibilityLabel={t("calendar.addEvent.recurring")}
                checked={isRecurring}
                onCheckedChange={(checked) => {
                  setIsRecurring(checked);
                  setErrors((prev) => ({
                    ...prev,
                    days: undefined,
                    endDate: undefined,
                  }));
                }}
              />
            </View>

            {isRecurring ? (
              <>
                <View className="gap-1.5">
                  <Text className="text-xs text-muted-foreground">
                    {t("calendar.addEvent.daysOfWeek")}
                  </Text>
                  <View className="flex-row gap-1.5">
                    {DAYS_OF_WEEK.map(({ value, label }) => {
                      const selected = selectedDays.includes(value);
                      return (
                        <Pressable
                          key={value}
                          testID={`event-day-${value}`}
                          accessibilityLabel={`Repeat on day ${value}`}
                          role="button"
                          onPress={() => toggleDay(value)}
                          className={cn(
                            "h-9 w-9 items-center justify-center rounded-full",
                            selected ? "bg-primary" : "bg-muted"
                          )}
                        >
                          <Text
                            className={cn(
                              "text-xs font-medium",
                              selected
                                ? "text-primary-foreground"
                                : "text-foreground"
                            )}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {errors.days ? (
                    <Text className="text-sm text-destructive">{errors.days}</Text>
                  ) : null}
                </View>

                <DatePickerInput
                  testID="event-end-date"
                  label={t("calendar.addEvent.endDate")}
                  value={endDate}
                  onChange={(value) => {
                    setEndDate(value);
                    setErrors((prev) => ({ ...prev, endDate: undefined }));
                  }}
                  error={errors.endDate}
                />
              </>
            ) : null}
          </View>

          {formError ? (
            <Text className="text-center text-sm text-destructive">
              {formError}
            </Text>
          ) : null}

          <Button
            testID="event-save"
            accessibilityLabel={t("calendar.addEvent.createEvent")}
            onPress={handleSave}
            disabled={addEvent.isPending}
          >
            {addEvent.isPending ? (
              <Spinner color={lightTheme.primaryForeground} />
            ) : null}
            <Text>
              {addEvent.isPending
                ? "Creating…"
                : t("calendar.addEvent.createEvent")}
            </Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function capitalize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
