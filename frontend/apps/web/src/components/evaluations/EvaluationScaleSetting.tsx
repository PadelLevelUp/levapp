import * as React from "react";
import { useTranslation } from "react-i18next";
import { useEvaluationScale, useSaveEvaluationScale } from "@levelup/hooks";
import type { EvaluationScaleMax } from "@levelup/types";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTabSave } from "@/context/SettingsUnsavedContext";

/**
 * evaluations.scale rules 1 and 8 (PAD-423) — "Escala de avaliações" on web, beside the
 * evaluation frequency. settings.explicit-save (PAD-506): a choice is held until the tab's
 * "Guardar alterações". The server rescales the coach's competencies; past scores keep their own
 * scale (rule 3), which the caption says.
 */
const SCALES: EvaluationScaleMax[] = [5, 10, 20, 100];

export function EvaluationScaleSetting() {
  const { t } = useTranslation();
  const { data, isLoading } = useEvaluationScale();
  const save = useSaveEvaluationScale();

  const [choice, setChoice] = React.useState<EvaluationScaleMax | null>(null);
  // The scale as the server last confirmed it: what "unsaved" is measured against.
  const [stored, setStored] = React.useState<EvaluationScaleMax | null>(null);
  // The server value hydrates local state once; after that every change is this control's own,
  // so a background refetch never flicks the coach's pick back.
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setChoice(data.scaleMax);
    setStored(data.scaleMax);
  }, [data]);

  const unsaved = choice !== null && stored !== null && choice !== stored;
  // settings.explicit-save rule 3: this control's part of the tab's one Save.
  useTabSave("evaluationScale", unsaved, {
    label: t("evaluations.scale.title"),
    save: async () => {
      if (choice === null) return;
      const answer = await save.mutateAsync({ scaleMax: choice });
      const confirmed = answer?.scaleMax ?? choice;
      setStored(confirmed);
      setChoice(confirmed);
    },
  });

  const handleSelect = (value: string) => setChoice(Number(value) as EvaluationScaleMax);

  return (
    <div className="space-y-3" data-testid="settings-evaluation-scale">
      <div>
        <h3 className="text-sm font-medium">{t("evaluations.scale.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("evaluations.scale.caption")}</p>
      </div>

      <RadioGroup value={choice === null ? "" : String(choice)} onValueChange={handleSelect} disabled={isLoading} className="gap-3">
        {SCALES.map((n) => (
          <div key={n} className="flex items-center gap-2">
            <RadioGroupItem value={String(n)} id={`evaluation-scale-${n}`} data-testid={`settings-evaluation-scale-option-${n}`} />
            <Label htmlFor={`evaluation-scale-${n}`} className="text-sm font-normal">
              {t(`evaluations.scale.options.${n}`)}
            </Label>
          </div>
        ))}
      </RadioGroup>

    </div>
  );
}
