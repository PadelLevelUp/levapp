import { useEvaluationScale, useSaveEvaluationScale } from "@levelup/hooks";
import type { EvaluationScaleMax } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { SaveSign, useSaveSign } from "@/features/settings/save-sign";

/**
 * evaluations.scale rules 1 and 8 (PAD-423) — the iOS twin of web's `EvaluationScaleSetting`,
 * beside the evaluation frequency. The four scales are Pressable rows with
 * `accessibilityRole="radio"`, as the frequency's are (no radio-group primitive is installed).
 * Saves `{scaleMax}` on change with the sign of settings.save-on-change; a failed save says so and
 * returns to the scale the server confirmed.
 */
const SCALES: EvaluationScaleMax[] = [5, 10, 20, 100];

export function EvaluationScaleSetting() {
  const { t } = useTranslation();
  const { data, isLoading } = useEvaluationScale();
  const save = useSaveEvaluationScale();

  const [choice, setChoice] = React.useState<EvaluationScaleMax | null>(null);
  const sign = useSaveSign();
  // settings.save-on-change rule 3: the scale the server last confirmed, and which save is newest.
  const confirmed = React.useRef<EvaluationScaleMax | null>(null);
  const saveSeq = React.useRef(0);
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setChoice(data.scaleMax);
    confirmed.current = data.scaleMax;
  }, [data]);

  const handleSelect = (next: EvaluationScaleMax) => {
    if (isLoading) return;
    const seq = ++saveSeq.current;
    setChoice(next);
    void sign.track("scale", save.mutateAsync({ scaleMax: next })).then(
      () => {
        confirmed.current = next;
      },
      () => {
        if (seq === saveSeq.current) setChoice(confirmed.current);
      },
    );
  };

  return (
    <Card testID="settings-evaluation-scale">
      <CardHeader>
        <View className="flex-row items-center justify-between gap-2">
          <CardTitle>{t("evaluations.scale.title")}</CardTitle>
          <SaveSign status={sign.status("scale")} testID="settings-evaluation-scale-sign" />
        </View>
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
