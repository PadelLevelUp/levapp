import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

interface ScoreStepperProps {
  id: number | string;
  name: string;
  score: number | null;
  scaleMin: number;
  scaleMax: number;
  /** Omit for a read-only "n/max" (a history card). */
  onStep?: (delta: 1 | -1) => void;
  onClear?: () => void;
}

/**
 * A legacy category keeps its own scale and is a NUMBER — "7/10" with a stepper,
 * never stars (evaluations.competencies rule 3, owner question Q1's default).
 * The value's testID carries the score (`…-value-7`, `…-value-none`): an empty
 * RN view vanishes from Maestro's hierarchy, a testID does not.
 */
export function ScoreStepper({ id, name, score, scaleMin, scaleMax, onStep, onClear }: ScoreStepperProps) {
  const { t } = useTranslation();
  const value = (
    <Text
      className={score === null ? "text-sm text-muted-foreground" : "text-sm font-medium"}
      testID={`evaluation-stepper-${id}-value-${score ?? "none"}`}
    >
      {score === null
        ? t("players.evaluationHistory.notRated")
        : t("players.evaluationHistory.stepperValue", { score, max: scaleMax })}
    </Text>
  );
  if (!onStep) return value;

  return (
    <View className="flex-row items-center gap-2">
      {score !== null && onClear ? (
        <Button variant="ghost" size="icon" onPress={onClear} testID={`evaluation-stepper-${id}-clear`}
          accessibilityLabel={t("players.evaluationHistory.clearScore", { name })}>
          <Ionicons name="refresh-outline" size={18} color={lightTheme.mutedForeground} />
        </Button>
      ) : null}
      <Button variant="outline" size="icon" onPress={() => onStep(-1)} disabled={score !== null && score <= scaleMin}
        testID={`evaluation-stepper-${id}-minus`} accessibilityLabel={t("players.evaluationHistory.stepDown", { name })}>
        <Ionicons name="remove" size={18} color={lightTheme.foreground} />
      </Button>
      <View className="min-w-[72px] items-center">{value}</View>
      <Button variant="outline" size="icon" onPress={() => onStep(1)} disabled={score !== null && score >= scaleMax}
        testID={`evaluation-stepper-${id}-plus`} accessibilityLabel={t("players.evaluationHistory.stepUp", { name })}>
        <Ionicons name="add" size={18} color={lightTheme.foreground} />
      </Button>
    </View>
  );
}
