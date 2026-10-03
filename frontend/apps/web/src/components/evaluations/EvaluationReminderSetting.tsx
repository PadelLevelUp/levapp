import * as React from "react";
import { useTranslation } from "react-i18next";
import { useEvaluationSettings, useSaveEvaluationSettings } from "@levelup/hooks";
import type { EvaluationSettings } from "@levelup/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTabSave } from "@/context/SettingsUnsavedContext";

/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — "Frequência de avaliações" on web.
 * settings.explicit-save (PAD-506): the choice and a typed number are held until the tab's
 * "Guardar alterações"; leaving with one unsaved asks first. "A cada 2/4 aulas" and "Personalizado"
 * are all `every_n_classes` (rule 1); "Personalizado" opens at 4. A typed number must be an integer
 * 1-99 — rule 8 refuses the rest on the server, and refusing it here too means a typo never sends
 * `everyN: 0`.
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
  // The setting as the server last confirmed it (loaded or saved): what "unsaved" is measured against.
  const [stored, setStored] = React.useState<EvaluationSettings | null>(null);
  // The server value hydrates local state once — after that, every change here is the coach's own,
  // never overwritten by a background refetch.
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
  const sameAsStored = (body: EvaluationSettings | null) =>
    !!body &&
    !!stored &&
    body.reminder === stored.reminder &&
    (body.reminder !== "every_n_classes" || body.everyN === stored.everyN);
  // settings.unsaved-edits rule 2: by value — choosing an option and back is clean; an invalid number is not.
  const unsaved = option !== "" && stored !== null && !sameAsStored(held);

  // settings.explicit-save rule 3: this control's part of the tab's one Save.
  const saveHeld = async () => {
    if (held === null) {
      setErrorKey("invalidNumber");
      throw new Error("invalid number");
    }
    setErrorKey(null);
    const confirmed = await save.mutateAsync(held);
    const next = confirmed ?? held;
    setStored(next);
    const opt = optionFromSettings(next);
    setOption(opt);
    if (opt === "custom") setCustomValue(String(next.everyN ?? DEFAULT_CUSTOM_N));
  };
  useTabSave("evaluationReminder", unsaved, { label: t("evaluations.reminder.title"), save: saveHeld });

  const handleSelect = (value: string) => {
    const next = value as ReminderOption;
    setErrorKey(null);
    // Rule 1: "Personalizado" opens at 4.
    if (next === "custom") setCustomValue(DEFAULT_CUSTOM_N);
    setOption(next);
  };

  const checkCustom = () => setErrorKey(validCustomN(customValue) === null ? "invalidNumber" : null);

  const disabled = isLoading;

  return (
    <div className="space-y-3" data-testid="settings-evaluation-reminder">
      <div>
        <h3 className="text-sm font-medium">{t("evaluations.reminder.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("evaluations.reminder.caption")}</p>
      </div>

      <RadioGroup value={option} onValueChange={handleSelect} disabled={disabled} className="gap-3">
        {OPTIONS.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <RadioGroupItem
              value={opt}
              id={`evaluation-reminder-${opt}`}
              data-testid={`settings-evaluation-reminder-option-${opt}`}
            />
            <Label htmlFor={`evaluation-reminder-${opt}`} className="text-sm font-normal">
              {t(`evaluations.reminder.options.${opt}`)}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {option === "custom" ? (
        <div className="space-y-1 max-w-xs">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              disabled={disabled}
              value={customValue}
              data-testid="settings-evaluation-reminder-n"
              onChange={(e) => {
                setCustomValue(e.target.value);
                if (validCustomN(e.target.value) !== null) setErrorKey(null);
              }}
              onBlur={checkCustom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  checkCustom();
                }
              }}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">{t("evaluations.reminder.suffix")}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("evaluations.reminder.hint")}</p>
        </div>
      ) : null}

      {errorKey ? (
        <p role="alert" data-testid="settings-evaluation-reminder-error" className="text-xs text-destructive">
          {t(`evaluations.reminder.${errorKey}`)}
        </p>
      ) : null}
    </div>
  );
}
