import * as React from "react";
import { useTranslation } from "react-i18next";
import { useEvaluationSettings, useSaveEvaluationSettings } from "@levelup/hooks";
import type { EvaluationSettings } from "@levelup/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — "Frequência de avaliações" on web.
 * Saves on change: there is no Save button and no dirty state, and a failed save puts the
 * previous choice back. "A cada 2/4 aulas" and "Personalizado" are all `every_n_classes`
 * (rule 1); "Personalizado" saves 4 when chosen, and a typed number saves on blur/Enter
 * once it is an integer 1-99 — rule 8 refuses the rest on the server, and refusing it
 * here too means a typo never sends `everyN: 0`.
 */
type ReminderOption = "never" | "monthly" | "every_2" | "every_4" | "custom";

const OPTIONS: ReminderOption[] = ["never", "monthly", "every_2", "every_4", "custom"];

const DEFAULT_CUSTOM_N = "4";

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
  // The server value hydrates local state once — after that, every change here is
  // this control's own (a selection or a saved custom number), never overwritten
  // by a background refetch, so a coach never sees their own pick flicker back.
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    const opt = optionFromSettings(data);
    setOption(opt);
    setCustomValue(opt === "custom" ? String(data.everyN ?? DEFAULT_CUSTOM_N) : DEFAULT_CUSTOM_N);
  }, [data]);

  // Every change is saved at once, so the control never shows a choice the server does not
  // hold: a refused or failed save puts the previous choice back and says so.
  const persist = (next: ReminderOption, everyN: number, previous: ReminderOption | "") => {
    setErrorKey(null);
    setOption(next);
    void save.mutateAsync(bodyForOption(next, everyN)).catch(() => {
      setOption(previous);
      setErrorKey("saveFailed");
    });
  };

  const handleSelect = (value: string) => {
    const next = value as ReminderOption;
    // Rule 1: "Personalizado" opens at 4, saved as soon as it is chosen; the typed number
    // then replaces it on blur/Enter.
    const n = next === "custom" ? Number(DEFAULT_CUSTOM_N) : Number(customValue);
    if (next === "custom") setCustomValue(DEFAULT_CUSTOM_N);
    persist(next, n, option);
  };

  const commitCustom = () => {
    const n = Number(customValue);
    if (!Number.isInteger(n) || n < 1 || n > 99) {
      setErrorKey("invalidNumber");
      return;
    }
    persist("custom", n, option);
  };

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
              onChange={(e) => setCustomValue(e.target.value)}
              onBlur={commitCustom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
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
