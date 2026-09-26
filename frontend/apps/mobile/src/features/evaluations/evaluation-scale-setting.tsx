import { useEvaluationScale, useSaveEvaluationScale } from "@levelup/hooks";
import type { EvaluationScaleMax } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * evaluations.scale rules 1 and 8 (PAD-423) — the iOS twin of web's `EvaluationScaleSetting`,
 * beside the evaluation frequency. The four scales are Pressable rows with
 * `accessibilityRole="radio"`, as the frequency's are (no radio-group primitive is installed).
 * Saves `{scaleMax}` on change; a failed save puts the previous choice back and says so.
 */
const SCALES: EvaluationScaleMax[] = [5, 10, 20, 100];

export function EvaluationScaleSetting() {
  const { t } = useTranslation();
  const { data, isLoading } = useEvaluationScale();
  const save = useSaveEvaluationScale();

  const [choice, setChoice] = React.useState<EvaluationScaleMax | null>(null);
  const [failed, setFailed] = React.useState(false);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setChoice(data.scaleMax);
  }, [data]);

  const handleSelect = (next: EvaluationScaleMax) => {
    if (isLoading) return;
    const previous = choice;
    setFailed(false);
    setChoice(next);
    void save.mutateAsync({ scaleMax: next }).catch(() => {
      setChoice(previous);
      setFailed(true);
    });
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

        {failed ? (
          <Text testID="settings-evaluation-scale-error" className="text-xs text-destructive">
            {t("evaluations.scale.saveFailed")}
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}
