import { Ionicons } from "@expo/vector-icons";
import { MAX_REQUEST_CLASSES, lightTheme, stepEndCount } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

export type EndMode = "date" | "count";

/**
 * classes.class-requests rule 14a (PAD-428, PAD-926): how a weekly request ends. A segmented control
 * ("Até uma data" / "N.º de aulas") shows one field at a time: the end date, or a stepper for the
 * class count (min 1, max MAX_REQUEST_CLASSES). The phone's half of web's PrivateClassStep control.
 */
export function EndModeControls({
  endMode,
  onModeChange,
  endDate,
  onEndDateChange,
  endCount,
  onEndCountChange,
}: {
  endMode: EndMode;
  onModeChange: (mode: EndMode) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
  endCount: number;
  onEndCountChange: (count: number) => void;
}) {
  const { t } = useTranslation();
  const stepper = (testID: string, label: string, icon: "remove" | "add", delta: 1 | -1, disabled: boolean) => (
    <Pressable
      testID={testID}
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onEndCountChange(stepEndCount(endCount, delta))}
      className="h-9 w-9 items-center justify-center rounded-md border border-input bg-background"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={18} color={lightTheme.foreground} />
    </Pressable>
  );
  return (
    <View className="gap-2">
      <View role="radiogroup" accessibilityLabel={t("classRequestWizard.endDate")} className="flex-row gap-1 rounded-md bg-muted p-1">
        {(["date", "count"] as const).map((mode) => {
          const selected = endMode === mode;
          return (
            <Pressable
              key={mode}
              role="radio"
              testID={`request-end-mode-${mode}`}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => onModeChange(mode)}
              className={cn("h-8 flex-1 items-center justify-center rounded", selected && "bg-background")}
            >
              <Text className={cn("text-xs font-medium", selected ? "text-foreground" : "text-muted-foreground")}>
                {t(`classRequestWizard.endMode.${mode}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {endMode === "date" ? (
        <DatePickerInput testID="wizard-end-date" value={endDate} onChange={onEndDateChange} />
      ) : (
        <View className="flex-row items-center gap-3">
          {stepper("request-end-count-dec", t("classRequestWizard.countDecrease"), "remove", -1, endCount <= 1)}
          <Text testID="request-end-count" className="min-w-8 text-center text-base font-semibold">
            {String(endCount)}
          </Text>
          {stepper("request-end-count-inc", t("classRequestWizard.countIncrease"), "add", 1, endCount >= MAX_REQUEST_CLASSES)}
          <Text className="text-xs text-muted-foreground">{t("classRequestWizard.classesUnit")}</Text>
        </View>
      )}
    </View>
  );
}
