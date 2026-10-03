import { useEvaluationSettings, useSaveEvaluationSettings } from "@levelup/hooks";
import type { EvaluationSettings } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useSectionSave } from "@/features/settings/unsaved-registry";

/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — the iOS twin of web's
 * `EvaluationReminderSetting`. No `@rn-primitives/radio-group` is installed (same
 * constraint `auto-invite-section.tsx` hit), so the five options are a vertical list
 * of Pressable rows with `accessibilityRole="radio"`, mirroring that file's pattern.
 * settings.explicit-save (PAD-506): the choice and a typed number are held until the screen's one
 * "Guardar alterações"; leaving with one unsaved asks first. A typed number must be an integer
 * 1-99, or Save refuses it in place. The web twin carries the same rules.
 */
type ReminderOption = "never" | "monthly" | "every_2" | "every_4" | "custom";

const OPTIONS: ReminderOption[] = ["never", "monthly", "every_2", "every_4", "custom"];

const DEFAULT_CUSTOM_N = "4";

function validCustomN(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

function optionFromSettings(settings: EvaluationSettings | undefined): ReminderOption | "" {
  if (!settings) return "";
  if (settings.reminder === "never") return "never";
  if (settings.reminder === "monthly") return "monthly";
  if (settings.everyN === 2) return "every_2";
  if (settings.everyN === 4) return "every_4";
  return "custom";
}

function bodyForOption(option: ReminderOption, everyN: number): EvaluationSettings {
  switch (option) {
    case "never":
      return { reminder: "never" };
    case "monthly":
      return { reminder: "monthly" };
    case "every_2":
      return { reminder: "every_n_classes", everyN: 2 };
    case "every_4":
      return { reminder: "every_n_classes", everyN: 4 };
    case "custom":
      return { reminder: "every_n_classes", everyN };
  }
}

export function EvaluationReminderSetting() {
  const { t } = useTranslation();
  const { data, isLoading } = useEvaluationSettings();
  const save = useSaveEvaluationSettings();

  const [option, setOption] = React.useState<ReminderOption | "">("");
  const [customValue, setCustomValue] = React.useState(DEFAULT_CUSTOM_N);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  // The setting as the server last confirmed it: what "unsaved" is measured against.
  const [stored, setStored] = React.useState<EvaluationSettings | null>(null);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    const opt = optionFromSettings(data);
    setOption(opt);
    setCustomValue(opt === "custom" ? String(data.everyN ?? DEFAULT_CUSTOM_N) : DEFAULT_CUSTOM_N);
    setStored(data);
  }, [data]);

  // What the screen holds, as the body a save would send; null while a typed number is not 1-99.
  const held: EvaluationSettings | null =
    option === ""
      ? null
      : option === "custom"
        ? (() => {
            const n = validCustomN(customValue);
            return n === null ? null : bodyForOption("custom", n);
          })()
        : bodyForOption(option, 0);
  const sameAsStored =
    !!held &&
    !!stored &&
    held.reminder === stored.reminder &&
    (held.reminder !== "every_n_classes" || held.everyN === stored.everyN);
  // settings.unsaved-edits rule 2: by value — choosing an option and back is clean; an invalid number is not.
  const unsaved = option !== "" && stored !== null && !sameAsStored;

  // settings.explicit-save rule 3: this control's part of the one Save.
  useSectionSave("evaluationReminder", unsaved, {
    label: t("evaluations.reminder.title"),
    save: async () => {
      if (held === null) {
        setErrorKey("invalidNumber");
        throw new Error("invalid number");
      }
      setErrorKey(null);
      const confirmed = (await save.mutateAsync(held)) ?? held;
      setStored(confirmed);
      const opt = optionFromSettings(confirmed);
      setOption(opt);
      if (opt === "custom") setCustomValue(String(confirmed.everyN ?? DEFAULT_CUSTOM_N));
    },
  });

  const handleSelect = (value: ReminderOption) => {
    if (isLoading) return;
    setErrorKey(null);
    // Rule 1: "Personalizado" opens at 4.
    if (value === "custom") setCustomValue(DEFAULT_CUSTOM_N);
    setOption(value);
  };

  const checkCustom = () => setErrorKey(validCustomN(customValue) === null ? "invalidNumber" : null);
  const changeCustom = (text: string) => {
    setCustomValue(text);
    if (validCustomN(text) !== null) setErrorKey(null);
  };

  return (
    <Card testID="settings-evaluation-reminder">
      <CardHeader>
        <CardTitle>{t("evaluations.reminder.title")}</CardTitle>
        <CardDescription>{t("evaluations.reminder.caption")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2" accessibilityRole="radiogroup">
        {OPTIONS.map((opt) => {
          const selected = option === opt;
          const label = t(`evaluations.reminder.options.${opt}`);
          return (
            <Pressable
              key={opt}
              testID={`settings-evaluation-reminder-option-${opt}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: isLoading }}
              accessibilityLabel={label}
              disabled={isLoading}
              onPress={() => handleSelect(opt)}
              className={cn(
                "flex-row items-center rounded-md border px-3 py-2.5",
                selected ? "border-primary bg-primary/10" : "border-input bg-background",
                isLoading && "opacity-50"
              )}
            >
              <Text className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>
                {label}
              </Text>
            </Pressable>
          );
        })}

        {option === "custom" ? (
          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              <Input
                testID="settings-evaluation-reminder-n"
                keyboardType="number-pad"
                returnKeyType="done"
                editable={!isLoading}
                value={customValue}
                onChangeText={changeCustom}
                onBlur={checkCustom}
                onSubmitEditing={checkCustom}
                className="w-20"
              />
              <Text className="text-sm text-muted-foreground">{t("evaluations.reminder.suffix")}</Text>
            </View>
            <Text className="text-xs text-muted-foreground">{t("evaluations.reminder.hint")}</Text>
          </View>
        ) : null}

        {errorKey ? (
          <Text testID="settings-evaluation-reminder-error" className="text-xs text-destructive">
            {t(`evaluations.reminder.${errorKey}`)}
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}
