import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useCoachLevels } from "@levelup/hooks";
import { classFormSchema } from "@levelup/validation";
import { addMonths, format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useAddClass } from "@/features/calendar/hooks";

const COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#6366f1",
];

// Monday-first, matching the web AddClassSheet.
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

const TYPE_OPTIONS: Option[] = [
  { value: "academy", label: "Academy" },
  { value: "private", label: "Private" },
];

type FieldErrors = Partial<
  Record<"date" | "startTime" | "endTime" | "maxPlayers" | "days" | "endDate", string>
>;

export default function NewClassScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { user } = useAuth();
  const { data: levels } = useCoachLevels();
  const addClass = useAddClass();

  const initialDate =
    typeof params.date === "string" && DATE_RE.test(params.date)
      ? params.date
      : format(new Date(), "yyyy-MM-dd");

  const [name, setName] = React.useState("");
  const [classType, setClassType] = React.useState<Option>(TYPE_OPTIONS[0]);
  const [date, setDate] = React.useState(initialDate);
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:30");
  const [maxPlayers, setMaxPlayers] = React.useState("4");
  const [color, setColor] = React.useState(COLORS[0]);
  const [levelOption, setLevelOption] = React.useState<Option>(undefined);
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

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setErrors((prev) => ({ ...prev, days: undefined }));
  };

  const validate = (): boolean => {
    const next: FieldErrors = {};

    if (!DATE_RE.test(date)) next.date = "Use YYYY-MM-DD";
    if (!TIME_RE.test(startTime)) next.startTime = "Use HH:MM";
    if (!TIME_RE.test(endTime)) next.endTime = "Use HH:MM";
    if (!next.startTime && !next.endTime && endTime <= startTime) {
      next.endTime = "Must be after start time";
    }
    const max = Number(maxPlayers);
    if (!Number.isInteger(max) || max < 1) next.maxPlayers = "Minimum 1 player";
    if (isRecurring && endDate && !DATE_RE.test(endDate)) {
      next.endDate = "Use YYYY-MM-DD";
    }

    // Shared schema: date required; recurring needs days + end date.
    const result = classFormSchema.safeParse({
      date: DATE_RE.test(date) ? date : "",
      isRecurring,
      daysOfWeek: selectedDays,
      endDate: endDate || null,
    });
    if (!result.success) {
      for (const issue of result.error.errors) {
        const field = issue.path[0];
        if (field === "date" && !next.date) next.date = "Date is required";
        if (field === "daysOfWeek") next.days = "Pick at least one day";
        if (field === "endDate" && !next.endDate) next.endDate = "End date is required";
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
      coachId: user?.coachId ?? "1",
      classType: (classType?.value ?? "academy") as string,
      isRecurring,
      name,
      date,
      startTime,
      endTime,
      maxPlayers: Number(maxPlayers),
      color,
      levelId: levelOption?.value || null,
      playerIds: [] as string[],
      notificationsEnabled: false,
      recurrenceRule: isRecurring
        ? { frequency: "weekly", daysOfWeek: selectedDays }
        : null,
      endDate: computedEndDate,
    };

    try {
      await addClass.mutateAsync(data);
      router.back();
    } catch {
      setFormError("The class could not be created. Please try again.");
    }
  };

  return (
    <Screen edges={["top"]} testID="class-new">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          testID="class-new-back"
          accessibilityLabel="Back"
          role="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={22} color={lightTheme.foreground} />
        </Pressable>
        <Text role="heading" aria-level={1} className="flex-1 text-lg font-bold">
          New class
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
          {/* Name */}
          <View className="gap-1.5">
            <Label>Name</Label>
            <Input
              testID="class-name"
              accessibilityLabel="Class name"
              placeholder={
                classType?.value === "private"
                  ? "e.g. Private – John & Mary"
                  : "e.g. Beginner Academy"
              }
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Type */}
          <View className="gap-1.5">
            <Label>Type</Label>
            <Select value={classType} onValueChange={setClassType}>
              <SelectTrigger
                testID="class-type-select"
                accessibilityLabel="Class type"
              >
                <SelectValue placeholder="Select type" />
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

          {/* Date */}
          <View className="gap-1.5">
            <Label>Date (YYYY-MM-DD)</Label>
            <Input
              testID="class-date"
              accessibilityLabel="Class date"
              placeholder="2026-01-31"
              autoCapitalize="none"
              autoCorrect={false}
              value={date}
              onChangeText={(value) => {
                setDate(value);
                setErrors((prev) => ({ ...prev, date: undefined }));
              }}
            />
            {errors.date ? (
              <Text className="text-sm text-destructive">{errors.date}</Text>
            ) : null}
          </View>

          {/* Times */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              <Label>Start (HH:MM)</Label>
              <Input
                testID="class-start-time"
                accessibilityLabel="Start time"
                placeholder="09:00"
                autoCapitalize="none"
                autoCorrect={false}
                value={startTime}
                onChangeText={(value) => {
                  setStartTime(value);
                  setErrors((prev) => ({ ...prev, startTime: undefined }));
                }}
              />
              {errors.startTime ? (
                <Text className="text-sm text-destructive">
                  {errors.startTime}
                </Text>
              ) : null}
            </View>
            <View className="flex-1 gap-1.5">
              <Label>End (HH:MM)</Label>
              <Input
                testID="class-end-time"
                accessibilityLabel="End time"
                placeholder="10:30"
                autoCapitalize="none"
                autoCorrect={false}
                value={endTime}
                onChangeText={(value) => {
                  setEndTime(value);
                  setErrors((prev) => ({ ...prev, endTime: undefined }));
                }}
              />
              {errors.endTime ? (
                <Text className="text-sm text-destructive">{errors.endTime}</Text>
              ) : null}
            </View>
          </View>

          {/* Max players */}
          <View className="gap-1.5">
            <Label>Max players</Label>
            <Input
              testID="class-max-players"
              accessibilityLabel="Maximum players"
              keyboardType="number-pad"
              value={maxPlayers}
              onChangeText={(value) => {
                setMaxPlayers(value.replace(/[^0-9]/g, ""));
                setErrors((prev) => ({ ...prev, maxPlayers: undefined }));
              }}
            />
            {errors.maxPlayers ? (
              <Text className="text-sm text-destructive">
                {errors.maxPlayers}
              </Text>
            ) : null}
          </View>

          {/* Level (optional) */}
          {levels && levels.length > 0 ? (
            <View className="gap-1.5">
              <Label>Level (optional)</Label>
              <Select value={levelOption} onValueChange={setLevelOption}>
                <SelectTrigger
                  testID="class-level-select"
                  accessibilityLabel="Class level"
                >
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem
                      key={level.id}
                      value={level.id}
                      label={level.label || level.code}
                    />
                  ))}
                </SelectContent>
              </Select>
            </View>
          ) : null}

          {/* Color */}
          <View className="gap-1.5">
            <Label>Color</Label>
            <View className="flex-row flex-wrap gap-2">
              {COLORS.map((value) => (
                <Pressable
                  key={value}
                  testID={`class-color-${value.slice(1)}`}
                  accessibilityLabel={`Color ${value}`}
                  role="button"
                  onPress={() => setColor(value)}
                  className={cn(
                    "h-8 w-8 rounded-full",
                    color === value && "border-2 border-primary"
                  )}
                  style={{ backgroundColor: value }}
                />
              ))}
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
                <Text className="text-sm font-medium">Recurring weekly</Text>
              </View>
              <Switch
                testID="class-recurring-switch"
                accessibilityLabel="Recurring class"
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
                    Days of the week
                  </Text>
                  <View className="flex-row gap-1.5">
                    {DAYS_OF_WEEK.map(({ value, label }) => {
                      const selected = selectedDays.includes(value);
                      return (
                        <Pressable
                          key={value}
                          testID={`class-day-${value}`}
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
                    <Text className="text-sm text-destructive">
                      {errors.days}
                    </Text>
                  ) : null}
                </View>

                <View className="gap-1.5">
                  <Text className="text-xs text-muted-foreground">
                    End date (YYYY-MM-DD)
                  </Text>
                  <Input
                    testID="class-end-date"
                    accessibilityLabel="Recurrence end date"
                    placeholder="2026-12-31"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={endDate}
                    onChangeText={(value) => {
                      setEndDate(value);
                      setErrors((prev) => ({ ...prev, endDate: undefined }));
                    }}
                  />
                  {errors.endDate ? (
                    <Text className="text-sm text-destructive">
                      {errors.endDate}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>

          {formError ? (
            <Text className="text-center text-sm text-destructive">
              {formError}
            </Text>
          ) : null}

          <Button
            testID="class-save"
            accessibilityLabel="Create class"
            onPress={handleSave}
            disabled={addClass.isPending}
          >
            {addClass.isPending ? (
              <Spinner color={lightTheme.primaryForeground} />
            ) : null}
            <Text>{addClass.isPending ? "Creating…" : "Create class"}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
