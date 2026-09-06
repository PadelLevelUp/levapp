import { Ionicons } from "@expo/vector-icons";
import { seasonsApi } from "@levelup/api";
import {
  findOverlappingEvent,
  findSeasonCoveringDate,
  lightTheme,
} from "@levelup/config";
import { useCalendarEvents, useCoachLevels } from "@levelup/hooks";
import { classFormSchema } from "@levelup/validation";
import { useQuery } from "@tanstack/react-query";
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
import { useAuth } from "@/auth/AuthContext";
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
import { cn } from "@/lib/utils";
import { useAddClass } from "@/features/calendar/hooks";
import { OverlapConfirmDialog } from "@/features/calendar/overlap-confirm-dialog";

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

// Monday-first, matching the web AddClassSheet. Initials and day names come
// from availability.dayInitials.<n> / availability.days.<n>, keyed by getDay().
const DAYS_OF_WEEK = [1, 2, 3, 4, 5, 6, 0];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const TYPE_OPTIONS = [
  { value: "academy", labelKey: "calendar.addClass.typeAcademy" },
  { value: "private", labelKey: "calendar.addClass.typePrivate" },
] as const;

/**
 * PAD-170 C7: the one backend rejection this screen explains in place rather
 * than as a generic "creation failed". Same constant web's `AddClassSheet`
 * exports; `calendar.seasons` rule 8 is where the code comes from.
 */
const NO_SEASON_COVERS_DATE = "no_season_covers_date";

type FieldErrors = Partial<
  Record<"date" | "startTime" | "endTime" | "maxPlayers" | "days" | "endDate", string>
>;

export default function NewClassScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ date?: string }>();
  const { user } = useAuth();
  const { data: levels } = useCoachLevels();
  const addClass = useAddClass();

  const initialDate =
    typeof params.date === "string" && DATE_RE.test(params.date)
      ? params.date
      : format(new Date(), "yyyy-MM-dd");

  const [name, setName] = React.useState("");
  // Stable value in state, translated label derived — otherwise the trigger
  // keeps showing the language that was active when it was picked.
  const [classTypeValue, setClassTypeValue] = React.useState<string>("academy");
  const typeOptions = React.useMemo(
    () => TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t]
  );
  const classType: Option =
    typeOptions.find((o) => o.value === classTypeValue) ?? typeOptions[0];
  const [date, setDate] = React.useState(initialDate);
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:30");
  const [maxPlayers, setMaxPlayers] = React.useState("4");
  const [color, setColor] = React.useState(COLORS[0]);
  const [levelOption, setLevelOption] = React.useState<Option>(undefined);
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [selectedDays, setSelectedDays] = React.useState<number[]>([]);
  const [endDate, setEndDate] = React.useState("");
  // PAD-170 C7: "recurs until season end" replaces the manual end date with the
  // covering season's end date, snapshotted server-side (`calendar.seasons`
  // rule 8).
  const [recursUntilSeasonEnd, setRecursUntilSeasonEnd] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [overlapOpen, setOverlapOpen] = React.useState(false);
  // Set when the backend rejected the create for a reason the coach can fix
  // here. The screen stays put and explains it beside the toggle instead of
  // navigating back over a class that was never created.
  const [rejection, setRejection] = React.useState<string | null>(null);

  // PAD-159: the overlap warning needs the day's existing events. Fetching the
  // single day (not the week) keeps this to what the check actually reads —
  // findOverlappingEvent compares day keys and ignores anything else.
  const { data: dayEvents } = useCalendarEvents(
    `${date}T00:00:00`,
    `${date}T23:59:59`
  );

  // PAD-170 C7: the coach's seasons, so the screen can warn BEFORE submitting
  // that no season covers this date. Web only learns that from the backend's
  // rejection; asking here costs one cached request and turns a failed create
  // into a hint next to the toggle that caused it.
  const { data: seasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: seasonsApi.getSeasons,
  });

  // A hint, never a gate: the phone's season list can be stale and the backend
  // stays the authority (`calendar.seasons` rule 8 fails closed either way).
  const coveringSeason = findSeasonCoveringDate(date, seasons);
  const showNoSeasonWarning =
    isRecurring &&
    recursUntilSeasonEnd &&
    (rejection === NO_SEASON_COVERS_DATE ||
      (seasons != null && coveringSeason == null));

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

    if (!DATE_RE.test(date)) next.date = t("ui.validation.useDateFormat");
    if (!TIME_RE.test(startTime))
      next.startTime = t("ui.validation.useTimeFormat");
    if (!TIME_RE.test(endTime)) next.endTime = t("ui.validation.useTimeFormat");
    if (!next.startTime && !next.endTime && endTime <= startTime) {
      next.endTime = t("classDetail.new.mustBeAfterStart");
    }
    const max = Number(maxPlayers);
    if (!Number.isInteger(max) || max < 1)
      next.maxPlayers = t("classDetail.new.minimumOnePlayer");
    if (isRecurring && endDate && !DATE_RE.test(endDate)) {
      next.endDate = t("ui.validation.useDateFormat");
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
        if (field === "date" && !next.date)
          next.date = t("classDetail.new.dateRequired");
        if (field === "daysOfWeek") next.days = t("classDetail.new.pickAtLeastOneDay");
        // PAD-170 C7: "recurs until season end" IS the end date — the season's
        // own, resolved server-side — so the shared schema's end-date
        // requirement does not apply while the toggle is on. Web makes the same
        // exception (`isRecurring && !recursUntilSeasonEnd && !endDate`).
        if (field === "endDate" && !next.endDate && !recursUntilSeasonEnd)
          next.endDate = t("classDetail.new.endDateRequired");
      }
    }

    setErrors(next);
    return Object.values(next).every((value) => !value);
  };

  const handleSave = async () => {
    setFormError(null);
    setRejection(null);
    if (!validate()) return;

    // PAD-159, mirroring web's AddClassSheet: a non-blocking warning. For a
    // recurring class only the first occurrence is checked, which is the scope
    // web uses too. The coach may genuinely want two things at once, so this
    // asks rather than refuses.
    const conflict = findOverlappingEvent(
      { date, startTime, endTime },
      dayEvents ?? []
    );
    if (conflict) {
      setOverlapOpen(true);
      return;
    }

    await proceedSave();
  };

  const proceedSave = async () => {
    setOverlapOpen(false);

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
      // PAD-170 C7, matching web's payload: the flag only travels for a
      // recurring class, and it replaces the end date rather than joining it —
      // sending both would let a manual date silently win over the season.
      recursUntilSeasonEnd: isRecurring ? recursUntilSeasonEnd : false,
      endDate: recursUntilSeasonEnd ? null : computedEndDate,
    };

    try {
      await addClass.mutateAsync(data);
      router.back();
    } catch (err) {
      // PAD-170 C7: a rejection the coach can fix on this screen keeps them on
      // it, with every field intact, and is explained beside the toggle that
      // caused it. Navigating back over a class that was never created is how
      // the failure went unnoticed.
      const code = (err as { response?: { data?: { code?: string } } })?.response
        ?.data?.code;
      if (code === NO_SEASON_COVERS_DATE) {
        setRejection(NO_SEASON_COVERS_DATE);
        return;
      }
      setFormError(t("classDetail.new.createFailed"));
    }
  };

  return (
    <Screen edges={["top"]} testID="class-new">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          testID="class-new-back"
          accessibilityLabel={t("common.back")}
          role="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={22} color={lightTheme.foreground} />
        </Pressable>
        <Text role="heading" aria-level={1} className="flex-1 text-lg font-bold">
          {t("classDetail.new.title")}
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
            <Label>{t("calendar.addClass.name")}</Label>
            <Input
              testID="class-name"
              accessibilityLabel={t("classDetail.classNameAria")}
              placeholder={
                classTypeValue === "private"
                  ? t("calendar.addClass.namePlaceholderPrivate")
                  : t("calendar.addClass.namePlaceholderAcademy")
              }
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* Type */}
          <View className="gap-1.5">
            <Label>{t("classDetail.new.typeLabel")}</Label>
            <Select
              value={classType}
              onValueChange={(opt) => opt?.value && setClassTypeValue(opt.value)}
            >
              <SelectTrigger
                testID="class-type-select"
                accessibilityLabel={t("classDetail.new.classTypeAria")}
              >
                <SelectValue placeholder={t("classDetail.new.selectTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    label={option.label}
                  />
                ))}
              </SelectContent>
            </Select>
          </View>

          {/* Date */}
          <DatePickerInput
            testID="class-date"
            label={t("calendar.addClass.date")}
            value={date}
            error={errors.date}
            onChange={(value) => {
              setDate(value);
              setErrors((prev) => ({ ...prev, date: undefined }));
            }}
          />

          {/* Times */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TimePickerInput
                testID="class-start-time"
                label={t("calendar.addEvent.startShort")}
                value={startTime}
                error={errors.startTime}
                onChange={(value) => {
                  setStartTime(value);
                  setErrors((prev) => ({ ...prev, startTime: undefined }));
                }}
              />
            </View>
            <View className="flex-1">
              <TimePickerInput
                testID="class-end-time"
                label={t("calendar.addEvent.endShort")}
                value={endTime}
                error={errors.endTime}
                onChange={(value) => {
                  setEndTime(value);
                  setErrors((prev) => ({ ...prev, endTime: undefined }));
                }}
              />
            </View>
          </View>

          {/* Max players */}
          <View className="gap-1.5">
            <Label>{t("classDetail.new.maxPlayers")}</Label>
            <Input
              testID="class-max-players"
              accessibilityLabel={t("classDetail.new.maximumPlayersAria")}
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
              <Label>{t("players.levelOptional")}</Label>
              <Select value={levelOption} onValueChange={setLevelOption}>
                <SelectTrigger
                  testID="class-level-select"
                  accessibilityLabel={t("classDetail.classLevelAria")}
                >
                  <SelectValue placeholder={t("players.selectLevel")} />
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
            <Label>{t("calendar.addClass.color")}</Label>
            <View className="flex-row flex-wrap gap-2">
              {COLORS.map((value) => (
                <Pressable
                  key={value}
                  testID={`class-color-${value.slice(1)}`}
                  accessibilityLabel={t("classDetail.new.colorAria", { value })}
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
                <Text className="text-sm font-medium">
                  {t("classDetail.new.recurringWeekly")}
                </Text>
              </View>
              <Switch
                testID="class-recurring-switch"
                accessibilityLabel={t("classDetail.new.recurringClassAria")}
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
                    {t("calendar.addClass.daysOfWeek")}
                  </Text>
                  <View className="flex-row gap-1.5">
                    {DAYS_OF_WEEK.map((value) => {
                      const selected = selectedDays.includes(value);
                      return (
                        <Pressable
                          key={value}
                          testID={`class-day-${value}`}
                          accessibilityLabel={t("classDetail.new.repeatOnDayAria", {
                            day: t(`availability.days.${value}`),
                          })}
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
                            {t(`availability.dayInitials.${value}`)}
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

                {/* PAD-170 C7: recurrence ran to a hand-typed end date with
                    nothing on screen saying seasons existed. The toggle, its
                    hint and the no-season warning are web's `AddClassSheet`
                    copy verbatim (`calendar.addClass.*`). */}
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-xs text-muted-foreground">
                    {t("calendar.addClass.recursUntilSeasonEnd")}
                  </Text>
                  <Switch
                    testID="class-season-end-switch"
                    accessibilityLabel={t("calendar.addClass.recursUntilSeasonEnd")}
                    checked={recursUntilSeasonEnd}
                    onCheckedChange={(checked) => {
                      setRecursUntilSeasonEnd(checked);
                      setRejection(null);
                      setErrors((prev) => ({ ...prev, endDate: undefined }));
                    }}
                  />
                </View>

                {showNoSeasonWarning ? (
                  <Text
                    testID="class-no-season-warning"
                    role="alert"
                    className="rounded-md border border-destructive bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    {t("calendar.addClass.noSeasonCoversDate")}
                  </Text>
                ) : null}

                {recursUntilSeasonEnd ? (
                  <Text className="text-xs text-muted-foreground">
                    {t("calendar.addClass.recursUntilSeasonEndHint")}
                  </Text>
                ) : (
                  <DatePickerInput
                    testID="class-end-date"
                    label={t("calendar.addClass.endDate")}
                    value={endDate}
                    error={errors.endDate}
                    onChange={(value) => {
                      setEndDate(value);
                      setErrors((prev) => ({ ...prev, endDate: undefined }));
                    }}
                  />
                )}
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
            accessibilityLabel={t("calendar.addClass.createClass")}
            onPress={handleSave}
            disabled={addClass.isPending}
          >
            {addClass.isPending ? (
              <Spinner color={lightTheme.primaryForeground} />
            ) : null}
            <Text>
              {addClass.isPending
                ? t("calendar.addClass.creating")
                : t("calendar.addClass.createClass")}
            </Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <OverlapConfirmDialog
        open={overlapOpen}
        onCancel={() => setOverlapOpen(false)}
        onConfirm={() => void proceedSave()}
      />
    </Screen>
  );
}
