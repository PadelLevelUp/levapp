import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Text } from "@/components/ui/text";
import {
  isValidCustomRange,
  type AttendanceRange,
  type AttendanceRangePreset,
} from "./date-ranges";

const PRESETS: Array<{
  key: AttendanceRangePreset;
  labelKey: string;
  ariaKey: string;
}> = [
  {
    key: "1w",
    labelKey: "attendance.ranges.week",
    ariaKey: "attendance.ranges.weekAria",
  },
  {
    key: "1m",
    labelKey: "attendance.ranges.month",
    ariaKey: "attendance.ranges.monthAria",
  },
  {
    key: "1y",
    labelKey: "attendance.ranges.year",
    ariaKey: "attendance.ranges.yearAria",
  },
];

/**
 * PAD-162 — the range controls, ported from web's
 * `components/attendance/AttendanceRangeControls.tsx` (PAD-114).
 *
 * Three presets plus `…`, which reveals a from/to pair for a custom period
 * (spec `attendance.history` rules 10–12). The user never picks a granularity:
 * the server derives it from the span and echoes it back, so there is nothing
 * here to keep in sync with the backend rule.
 *
 * `Clear` only exists while a custom period is applied — clearing drops it and
 * restores the preset view, from which a new custom period can be set.
 *
 * The one deliberate departure from web is the field control: web uses two
 * `<input type="date">`, which has no React Native equivalent, so this uses the
 * app's `DatePickerInput` (the native picker) with the same `YYYY-MM-DD`
 * contract on both sides.
 */
export function AttendanceRangeControls({
  preset,
  customRange,
  onSelectPreset,
  onApplyCustom,
  onClearCustom,
  testIDPrefix = "attendance",
}: {
  preset: AttendanceRangePreset;
  customRange: AttendanceRange | null;
  onSelectPreset: (preset: AttendanceRangePreset) => void;
  onApplyCustom: (range: AttendanceRange) => void;
  onClearCustom: () => void;
  testIDPrefix?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const [from, setFrom] = React.useState(customRange?.from ?? "");
  const [to, setTo] = React.useState(customRange?.to ?? "");
  const [invalid, setInvalid] = React.useState(false);

  // Keep the fields in step when the active custom period changes elsewhere
  // (e.g. Clear), so reopening `…` never shows a stale period.
  React.useEffect(() => {
    setFrom(customRange?.from ?? "");
    setTo(customRange?.to ?? "");
    if (customRange) setExpanded(true);
  }, [customRange]);

  const handleApply = () => {
    if (!isValidCustomRange(from, to)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onApplyCustom({ from, to });
  };

  const handleClear = () => {
    setInvalid(false);
    setExpanded(false);
    onClearCustom();
  };

  return (
    <View testID={`${testIDPrefix}-range-controls`} className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        {PRESETS.map((item) => {
          const active = !customRange && preset === item.key;
          return (
            <Button
              key={item.key}
              size="sm"
              variant={active ? "default" : "outline"}
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(item.ariaKey)}
              testID={`${testIDPrefix}-range-${item.key}`}
              onPress={() => {
                setExpanded(false);
                setInvalid(false);
                onSelectPreset(item.key);
              }}
              className="min-w-12"
            >
              <Text>{t(item.labelKey)}</Text>
            </Button>
          );
        })}

        <Button
          size="sm"
          variant={customRange ? "default" : "outline"}
          accessibilityState={{ selected: Boolean(customRange), expanded }}
          accessibilityLabel={t("attendance.ranges.customAria")}
          testID={`${testIDPrefix}-range-custom`}
          onPress={() => setExpanded((open) => !open)}
          className="min-w-12"
        >
          <Text>{t("attendance.ranges.custom")}</Text>
        </Button>

        {customRange ? (
          <Button
            size="sm"
            variant="ghost"
            testID={`${testIDPrefix}-range-clear`}
            accessibilityLabel={t("attendance.ranges.clear")}
            onPress={handleClear}
          >
            <Ionicons name="close" size={16} color={lightTheme.foreground} />
            <Text>{t("attendance.ranges.clear")}</Text>
          </Button>
        ) : null}
      </View>

      {expanded ? (
        <View
          testID={`${testIDPrefix}-custom-fields`}
          className="gap-3 rounded-md border border-border bg-muted p-3"
        >
          <DatePickerInput
            testID={`${testIDPrefix}-custom-from`}
            label={t("attendance.ranges.from")}
            value={from}
            onChange={setFrom}
          />
          <DatePickerInput
            testID={`${testIDPrefix}-custom-to`}
            label={t("attendance.ranges.to")}
            value={to}
            onChange={setTo}
          />
          <Button
            size="sm"
            testID={`${testIDPrefix}-custom-apply`}
            accessibilityLabel={t("attendance.ranges.apply")}
            onPress={handleApply}
          >
            <Text>{t("attendance.ranges.apply")}</Text>
          </Button>
          {invalid ? (
            <Text role="alert" className="text-xs text-destructive">
              {t("attendance.ranges.invalid")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
