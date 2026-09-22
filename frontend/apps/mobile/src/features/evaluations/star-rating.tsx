import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

const LIT = lightTheme.warning; // the amber web draws stars in (`text-warning`)

interface StarRatingProps {
  /** Used in test ids. */
  id: number | string;
  name: string;
  score: number | null;
  max?: number;
  /** Omit for a read-only row (a history card). */
  onRate?: (tapped: number) => void;
  size?: "sm" | "md";
}

/**
 * The star row on iOS (PAD-374) — the evaluation form and the history cards use
 * it, and slice 6's class panel will. It draws and reports taps; what a tap MEANS
 * (`nextStarScore`: the lit star clears) is the caller's, from `@levelup/config`.
 * Only for 1-5 competencies: a legacy category is a number (`ScoreStepper`).
 *
 * Each star is its own Pressable with `accessibilityState.selected`, so Maestro
 * can assert which one is lit (the pattern `PresenceMarkToggle` uses).
 */
export function StarRating({ id, name, score, max = 5, onRate, size = "md" }: StarRatingProps) {
  const { t } = useTranslation();
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  const glyph = size === "sm" ? 16 : 28;
  const summary =
    score === null
      ? t("players.evaluationHistory.starUnrated", { name })
      : t("players.evaluationHistory.starLabel", { name, score, max });

  if (!onRate) {
    return (
      <View className="flex-row items-center" accessible accessibilityRole="image" accessibilityLabel={summary}
        testID={`evaluation-stars-${id}-${score ?? "none"}`}>
        {stars.map((n) => (
          <Ionicons key={n} name={score !== null && n <= score ? "star" : "star-outline"} size={glyph}
            color={score !== null && n <= score ? LIT : lightTheme.mutedForeground} />
        ))}
      </View>
    );
  }

  return (
    <View className="flex-row items-center" accessibilityLabel={summary} testID={`evaluation-stars-${id}`}>
      {stars.map((n) => {
        const lit = score !== null && n <= score;
        return (
          <Pressable
            key={n}
            // 44pt touch target around a 28pt glyph
            className="h-11 w-10 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={
              score === n
                ? t("players.evaluationHistory.clearStar", { name })
                : t("players.evaluationHistory.rateStar", { name, score: n, max })
            }
            accessibilityState={{ selected: lit }}
            testID={`evaluation-star-${id}-${n}`}
            onPress={() => onRate(n)}
          >
            <Ionicons name={lit ? "star" : "star-outline"} size={glyph} color={lit ? LIT : lightTheme.mutedForeground} />
          </Pressable>
        );
      })}
    </View>
  );
}
