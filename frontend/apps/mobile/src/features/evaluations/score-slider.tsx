import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

interface ScoreSliderProps {
  id: number | string;
  name: string;
  score: number | null;
  scaleMin: number;
  scaleMax: number;
  /** Called ONCE per input, when the finger lifts (a drag or a tap), never while dragging. */
  onCommit: (score: number) => void;
  onClear?: () => void;
}

/**
 * evaluations.scale rule 7 (PAD-423): a competency on the coach's 1-10, 1-20 or 1-100 is rated
 * with a slider, whole steps, the value beside it ("7/10"). A drag is ONE input, like a star tap
 * (evaluations.records' one-request-per-input rule): the value follows the thumb locally and is
 * saved on `onSlidingComplete` only. `tapToSeek` lets a tap land on a value (and Maestro rate by
 * a tap at a known point). Unrated shows "–/10" until first touched. The value's testID carries
 * the score (`…-value-7`, `…-value-none`), as the stepper's does, for Maestro.
 */
export function ScoreSlider({ id, name, score, scaleMin, scaleMax, onCommit, onClear }: ScoreSliderProps) {
  const { t } = useTranslation();
  // The thumb's position while dragging; the server's score again once it answers.
  const [draft, setDraft] = React.useState<number | null>(null);
  React.useEffect(() => setDraft(null), [score]);
  const shown = draft ?? score;

  return (
    <View className="flex-row items-center gap-2" testID={`evaluation-slider-${id}`}>
      <Slider
        style={{ flex: 1, height: 40 }}
        minimumValue={scaleMin}
        maximumValue={scaleMax}
        step={1}
        value={score ?? scaleMin}
        tapToSeek
        onValueChange={(value) => setDraft(Math.round(value))}
        onSlidingComplete={(value) => onCommit(Math.round(value))}
        minimumTrackTintColor={lightTheme.primary}
        maximumTrackTintColor={lightTheme.border}
        testID={`evaluation-slider-${id}-input`}
        accessibilityLabel={name}
      />
      {/* ONE fixed width, so the value changing never moves the slider (nothing moves under the finger). */}
      <View className="w-[72px] items-center">
        <Text
          className={shown === null ? "text-sm text-muted-foreground" : "text-sm font-medium"}
          testID={`evaluation-slider-${id}-value-${shown ?? "none"}`}
          accessibilityLabel={shown === null ? t("players.evaluationHistory.notRated") : undefined}
        >
          {shown === null
            ? t("players.evaluationHistory.stepperUnrated", { max: scaleMax })
            : t("players.evaluationHistory.stepperValue", { score: shown, max: scaleMax })}
        </Text>
      </View>
      {/* The clear control comes last and its place is always kept, as the stepper's. */}
      {onClear ? (
        <View className="h-10 w-10">
          {score !== null ? (
            <Button variant="ghost" size="icon" onPress={onClear} testID={`evaluation-slider-${id}-clear`}
              accessibilityLabel={t("players.evaluationHistory.clearScore", { name })}>
              <Ionicons name="refresh-outline" size={18} color={lightTheme.mutedForeground} />
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
