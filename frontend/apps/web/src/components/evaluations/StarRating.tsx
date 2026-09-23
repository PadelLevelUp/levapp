import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  /** Used in test ids and as the accessible name's subject. */
  id: number | string;
  name: string;
  score: number | null;
  max?: number;
  /** Omit for a read-only row (a history card, a shared card). */
  onRate?: (tapped: number) => void;
  size?: "sm" | "md";
}

/**
 * The star row (PAD-374) — shared by the evaluation form, the history cards and,
 * in slice 6, the class panel. It draws and reports taps; what a tap MEANS
 * (`nextStarScore`: the lit star clears) is the caller's, from `@levelup/config`.
 * For every 1-5 scale, converted legacy categories included (PAD-403); `ScoreStepper` is
 * dormant, kept only for a scale that is not 1-5 (`isStarScale`).
 */
export function StarRating({ id, name, score, max = 5, onRate, size = "md" }: StarRatingProps) {
  const { t } = useTranslation();
  const stars = Array.from({ length: max }, (_, i) => i + 1);
  const icon = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  const summary =
    score === null
      ? t("players.evaluationHistory.starUnrated", { name })
      : t("players.evaluationHistory.starLabel", { name, score, max });

  if (!onRate) {
    return (
      <div className="flex items-center gap-0.5" role="img" aria-label={summary} data-testid={`evaluation-stars-${id}`} data-score={score ?? ""}>
        {stars.map((n) => (
          <Star key={n} className={cn(icon, score !== null && n <= score ? "fill-warning text-warning" : "text-muted-foreground/40")} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={summary} data-testid={`evaluation-stars-${id}`} data-score={score ?? ""}>
      {stars.map((n) => {
        const isLit = score !== null && n <= score;
        return (
          <button
            key={n}
            type="button"
            // 44px touch target around a 24px glyph
            className="flex h-11 w-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={
              score === n
                ? t("players.evaluationHistory.clearStar", { name })
                : t("players.evaluationHistory.rateStar", { name, score: n, max })
            }
            aria-pressed={score === n}
            data-testid={`evaluation-star-${id}-${n}`}
            data-lit={isLit}
            onClick={() => onRate(n)}
          >
            <Star className={cn(icon, isLit ? "fill-warning text-warning" : "text-muted-foreground/40")} />
          </button>
        );
      })}
    </div>
  );
}
