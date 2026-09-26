import { MAX_REQUEST_CLASSES, type RecurrenceEndMode } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export interface RecurrenceEndChoiceProps {
  mode: RecurrenceEndMode;
  onModeChange: (mode: RecurrenceEndMode) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  endDateError?: string;
  countText: string;
  onCountTextChange: (value: string) => void;
  countError?: string;
  /** The Nth class's date when the count is valid (`recurrenceEndPayload`). */
  lastDate: string | null;
  /** The season end the Nth class falls after (`countPassesSeasonEnd`) — a note, never a cap. */
  pastSeasonEnd: string | null;
}

const MODES: readonly RecurrenceEndMode[] = ["date", "count", "season"];

/**
 * classes.create rule 9 (PAD-463) on iOS — the twin of web's AddClassSheet choice, the same copy
 * (`calendar.addClass.*`): a recurring class ends on a date, after N classes, or at the season end.
 * Presentational: the screen owns the state and turns it into the payload with the shared
 * `recurrenceEndPayload`.
 */
export function RecurrenceEndChoice(props: RecurrenceEndChoiceProps) {
  const { t } = useTranslation();
  const { mode } = props;

  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t("calendar.addClass.endDate")}>
      {MODES.map((option) => {
        const selected = mode === option;
        return (
          <View key={option} className="gap-1">
            <Pressable
              testID={`class-end-mode-${option}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`calendar.addClass.endMode.${option}`)}
              onPress={() => props.onModeChange(option)}
              className="flex-row items-center gap-2 py-1"
            >
              <View
                className={cn(
                  "h-4 w-4 rounded-full border-2",
                  selected ? "border-primary bg-primary" : "border-muted-foreground bg-background"
                )}
              />
              <Text className="text-sm">{t(`calendar.addClass.endMode.${option}`)}</Text>
            </Pressable>

            {selected && option === "date" ? (
              <DatePickerInput
                testID="class-end-date"
                label={t("calendar.addClass.endDate")}
                value={props.endDate}
                error={props.endDateError}
                onChange={props.onEndDateChange}
              />
            ) : null}

            {selected && option === "count" ? (
              <View className="gap-1">
                <View className="flex-row items-center gap-2">
                  <Input
                    testID="class-end-count"
                    className="w-20"
                    keyboardType="number-pad"
                    maxLength={String(MAX_REQUEST_CLASSES).length}
                    accessibilityLabel={t("calendar.addClass.fieldEndCount")}
                    value={props.countText}
                    onChangeText={props.onCountTextChange}
                  />
                  <Text className="text-sm text-muted-foreground">{t("calendar.addClass.classesUnit")}</Text>
                </View>
                {props.countError ? <Text className="text-sm text-destructive">{props.countError}</Text> : null}
                {props.lastDate ? (
                  <Text testID="class-end-count-last" className="text-xs text-muted-foreground">
                    {t("calendar.addClass.lastClass", { date: props.lastDate })}
                  </Text>
                ) : null}
                {props.pastSeasonEnd ? (
                  <Text testID="class-end-count-past-season" className="text-xs text-muted-foreground">
                    {t("calendar.addClass.countPastSeason", { last: props.lastDate, end: props.pastSeasonEnd })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {selected && option === "season" ? (
              <Text testID="class-end-season-hint" className="text-xs text-muted-foreground">
                {t("calendar.addClass.recursUntilSeasonEndHint")}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
