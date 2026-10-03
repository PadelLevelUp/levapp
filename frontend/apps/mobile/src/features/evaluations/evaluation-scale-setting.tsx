import { useEvaluationScale, useSaveEvaluationScale } from "@levelup/hooks";
import type { EvaluationScaleMax } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useSectionSave } from "@/features/settings/unsaved-registry";

/**
 * evaluations.scale rules 1 and 8 (PAD-423) — the iOS twin of web's `EvaluationScaleSetting`,
 * beside the evaluation frequency. The four scales are Pressable rows with
 * `accessibilityRole="radio"`, as the frequency's are (no radio-group primitive is installed).
 * settings.explicit-save (PAD-506): a choice is held until the screen's one "Guardar alterações".
 */
const SCALES: EvaluationScaleMax[] = [5, 10, 20, 100];

export function EvaluationScaleSetting() {
  const { t } = useTranslation();
  const { data, isLoading } = useEvaluationScale();
  const save = useSaveEvaluationScale();

  const [choice, setChoice] = React.useState<EvaluationScaleMax | null>(null);
  // The scale as the server last confirmed it: what "unsaved" is measured against.
  const [stored, setStored] = React.useState<EvaluationScaleMax | null>(null);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setChoice(data.scaleMax);
    setStored(data.scaleMax);
  }, [data]);

  // settings.explicit-save rule 3: this control's part of the one Save.
  useSectionSave("evaluationScale", choice !== null && stored !== null && choice !== stored, {
    label: t("evaluations.scale.title"),
    save: async () => {
      if (choice === null) return;
      const answer = await save.mutateAsync({ scaleMax: choice });
      const confirmed = answer?.scaleMax ?? choice;
      setStored(confirmed);
      setChoice(confirmed);
    },
  });

  const handleSelect = (next: EvaluationScaleMax) => {
    if (isLoading) return;
    setChoice(next);
  };

  return (
    <Card testID="settings-evaluation-scale">
      <CardHeader>
        <CardTitle>{t("evaluations.scale.title")}</CardTitle>
        <CardDescription>{t("evaluations.scale.caption")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2" accessibilityRole="radiogroup">
        {SCALES.map((n) => {
          const selected = choice === n;
          const label = t(`evaluations.scale.options.${n}`);
          return (
            <Pressable
              key={n}
              testID={`settings-evaluation-scale-option-${n}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: isLoading }}
              accessibilityLabel={label}
              disabled={isLoading}
              onPress={() => handleSelect(n)}
              className={cn(
                "flex-row items-center rounded-md border px-3 py-2.5",
                selected ? "border-primary bg-primary/10" : "border-input bg-background",
                isLoading && "opacity-50"
              )}
            >
              <Text className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>{label}</Text>
            </Pressable>
          );
        })}
      </CardContent>
    </Card>
  );
}
