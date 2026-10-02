import * as React from "react";
import { useTranslation } from "react-i18next";
import { useEvaluationSettings, useSaveEvaluationSettings } from "@levelup/hooks";
import type { EvaluationSettings } from "@levelup/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SaveSign, useSaveSign } from "@/components/settings/SaveSign";
import { useFlushOnPageHide } from "./useFlushOnPageHide";

/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — "Frequência de avaliações" on web.
 * Saves on change: there is no Save button and no dirty state, and a failed save puts the
 * previous choice back. "A cada 2/4 aulas" and "Personalizado" are all `every_n_classes`
 * (rule 1); "Personalizado" saves 4 when chosen, and a typed number saves once it is an
 * integer 1-99: shortly after typing stops, at once on blur/Enter, and on leaving the screen
 * (B-242) — rule 8 refuses the rest on the server, and refusing it here too means a typo
 * never sends `everyN: 0`.
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
  // The server value hydrates local state once — after that, every change here is
  // this control's own (a selection or a saved custom number), never overwritten
  // by a background refetch, so a coach never sees their own pick flicker back.
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
  const persist = (next: ReminderOption, everyN: number, keepalive = false) => {
    const seq = ++saveSeq.current;
    setErrorKey(null);
    setOption(next);
    sentCustomN.current = next === "custom" ? everyN : null;
    const body = bodyForOption(next, everyN);
    void sign.track("reminder", save.mutateAsync(keepalive ? { ...body, keepalive } : body)).then(
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

  const handleSelect = (value: string) => {
    const next = value as ReminderOption;
    // Rule 1: "Personalizado" opens at 4, saved as soon as it is chosen; the typed number
    // then replaces it on blur/Enter.
    cancelPendingSave();
    const n = next === "custom" ? Number(DEFAULT_CUSTOM_N) : Number(customValue);
    if (next === "custom") {
      setCustomValue(DEFAULT_CUSTOM_N);
      latestCustom.current = DEFAULT_CUSTOM_N;
    }
    persist(next, n);
  };

  const commitCustom = (keepalive = false) => {
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
    persist("custom", n, keepalive);
  };

  const changeCustom = (text: string) => {
    setCustomValue(text);
    latestCustom.current = text;
    cancelPendingSave();
    if (validCustomN(text) !== null) pendingSave.current = setTimeout(() => commitCustom(), CUSTOM_SAVE_DELAY_MS);
  };

  // B-242: a typed number still waiting for its delayed save is sent when the screen goes away,
  // and with keepalive when the page itself goes away (tab closed or hidden; PAD-473).
  const commitRef = React.useRef(commitCustom);
  commitRef.current = commitCustom;
  React.useEffect(
    () => () => {
      if (pendingSave.current) commitRef.current();
    },
    [],
  );
  useFlushOnPageHide(({ keepalive }) => {
    if (pendingSave.current) commitCustom(keepalive);
  });

  const disabled = isLoading;

  return (
    <div className="space-y-3" data-testid="settings-evaluation-reminder">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t("evaluations.reminder.title")}</h3>
          <SaveSign status={sign.status("reminder")} testId="settings-evaluation-reminder-sign" />
        </div>
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
              onChange={(e) => changeCustom(e.target.value)}
              onBlur={() => commitCustom()}
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
