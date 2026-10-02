import { useEvaluationScale, useSaveEvaluationScale } from "@levelup/hooks";
import type { EvaluationScaleMax } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { SaveSign, useSaveSign } from "@/features/settings/save-sign";
import { SaveLedger, createSerialSaver } from "@levelup/config";

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
  // settings.save-on-change rule 3: what a failure puts back comes from the shared SaveLedger.
  const ledger = React.useRef(new SaveLedger<{ scaleMax: EvaluationScaleMax }>());
  // settings.save-on-change rule 3: one save of this field in flight at a time, the latest pending
  // value sent next, so the server ends in the order the saves were sent.
  const sendScale = React.useRef(save.mutateAsync);
  sendScale.current = save.mutateAsync;
  const [saveScale] = React.useState(() => createSerialSaver((body: { scaleMax: EvaluationScaleMax }) => sendScale.current(body)));
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    setChoice(data.scaleMax);
    ledger.current.seed({ scaleMax: data.scaleMax });
  }, [data]);

  const handleSelect = (next: EvaluationScaleMax) => {
    if (isLoading) return;
    const token = ledger.current.begin({ scaleMax: next });
    setChoice(next);
    void sign.track("scale", saveScale({ scaleMax: next })).then(
      (answer) => {
        const shown = ledger.current.confirm(token, answer).show.scaleMax;
        if (shown !== undefined) setChoice(shown);
      },
      () => {
        const back = ledger.current.fail(token).scaleMax;
        if (back !== undefined) setChoice(back);
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
