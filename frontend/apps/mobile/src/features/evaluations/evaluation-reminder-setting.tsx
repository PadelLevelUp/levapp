import { useEvaluationSettings, useSaveEvaluationSettings } from "@levelup/hooks";
import type { EvaluationSettings } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import { SaveSign, useSaveSign } from "@/features/settings/save-sign";

import { useFlushOnBackground } from "./use-flush-on-background";

/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — the iOS twin of web's
 * `EvaluationReminderSetting`. No `@rn-primitives/radio-group` is installed (same
 * constraint `auto-invite-section.tsx` hit), so the five options are a vertical list
 * of Pressable rows with `accessibilityRole="radio"`, mirroring that file's pattern.
 * Saves on change and puts the previous choice back when a save fails. The custom number saves
 * once it is an integer 1-99: shortly after typing stops, and at once on blur/submit, on leaving
 * the screen, or when the app leaves the foreground (B-242: the number pad has no Return key, so
 * a number left in a focused field was lost). The web twin carries the same rules.
 */
type ReminderOption = "never" | "monthly" | "every_2" | "every_4" | "custom";

const OPTIONS: ReminderOption[] = ["never", "monthly", "every_2", "every_4", "custom"];

const DEFAULT_CUSTOM_N = "4";

/** B-242: how long after the last keystroke a valid typed number is saved. */
export const CUSTOM_SAVE_DELAY_MS = 600;

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
  const sign = useSaveSign();
  // settings.save-on-change rule 3: what the server last confirmed, and which save is newest —
  // only the newest save's failure puts the control back, to the confirmed value.
  const confirmed = React.useRef<{ option: ReminderOption | ""; custom: string }>({ option: "", custom: DEFAULT_CUSTOM_N });
  const saveSeq = React.useRef(0);
  const hydrated = React.useRef(false);
  // B-242: the custom number last sent (so a blur right after the delayed save sends nothing
  // twice), the field's latest text, and the timer of a save still waiting for typing to stop.
  const sentCustomN = React.useRef<number | null>(null);
  const latestCustom = React.useRef(DEFAULT_CUSTOM_N);
  const pendingSave = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    const opt = optionFromSettings(data);
    setOption(opt);
    const custom = opt === "custom" ? String(data.everyN ?? DEFAULT_CUSTOM_N) : DEFAULT_CUSTOM_N;
    setCustomValue(custom);
    latestCustom.current = custom;
    sentCustomN.current = opt === "custom" ? data.everyN ?? null : null;
    confirmed.current = { option: opt, custom };
  }, [data]);

  // Every change is saved at once and signed (settings.save-on-change): a refused or failed save
  // says so and puts the control back to the last value the server confirmed.
  const persist = (next: ReminderOption, everyN: number) => {
    const seq = ++saveSeq.current;
    setErrorKey(null);
    setOption(next);
    sentCustomN.current = next === "custom" ? everyN : null;
    void sign.track("reminder", save.mutateAsync(bodyForOption(next, everyN))).then(
      () => {
        confirmed.current = { option: next, custom: next === "custom" ? String(everyN) : confirmed.current.custom };
      },
      () => {
        if (seq !== saveSeq.current) return;
        const back = confirmed.current;
        setOption(back.option);
        setCustomValue(back.custom);
        latestCustom.current = back.custom;
        sentCustomN.current = back.option === "custom" ? Number(back.custom) : null;
      },
    );
  };

  const cancelPendingSave = () => {
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = null;
  };

  const handleSelect = (value: ReminderOption) => {
    if (isLoading) return;
    // Rule 1: "Personalizado" opens at 4, saved as soon as it is chosen; the typed number
    // then replaces it on blur/submit.
    cancelPendingSave();
    const n = value === "custom" ? Number(DEFAULT_CUSTOM_N) : Number(customValue);
    if (value === "custom") {
      setCustomValue(DEFAULT_CUSTOM_N);
      latestCustom.current = DEFAULT_CUSTOM_N;
    }
    persist(value, n);
  };

  const commitCustom = () => {
    cancelPendingSave();
    const n = validCustomN(latestCustom.current);
    if (n === null) {
      setErrorKey("invalidNumber");
      return;
    }
    if (n === sentCustomN.current) {
      // Already stored: nothing to send, but an earlier "invalid" no longer applies.
      setErrorKey(null);
      return;
    }
    persist("custom", n);
  };

  const changeCustom = (text: string) => {
    setCustomValue(text);
    latestCustom.current = text;
    cancelPendingSave();
    if (validCustomN(text) !== null) pendingSave.current = setTimeout(commitCustom, CUSTOM_SAVE_DELAY_MS);
  };

  // B-242: a typed number still waiting for its delayed save is sent now when the app leaves
  // the foreground or the screen goes away — neither blurs the field.
  const flushPendingSave = () => {
    if (pendingSave.current) commitCustom();
  };
  useFlushOnBackground(flushPendingSave);
  const flushRef = React.useRef(flushPendingSave);
  flushRef.current = flushPendingSave;
  React.useEffect(() => () => flushRef.current(), []);

  return (
    <Card testID="settings-evaluation-reminder">
      <CardHeader>
        <View className="flex-row items-center justify-between gap-2">
          <CardTitle>{t("evaluations.reminder.title")}</CardTitle>
          <SaveSign status={sign.status("reminder")} testID="settings-evaluation-reminder-sign" />
        </View>
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
                onBlur={commitCustom}
                onSubmitEditing={commitCustom}
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
