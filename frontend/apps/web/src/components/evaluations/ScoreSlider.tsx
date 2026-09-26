import * as React from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface ScoreSliderProps {
  id: number | string;
  name: string;
  score: number | null;
  scaleMin: number;
  scaleMax: number;
  /** Called ONCE per input, on release (a drag or a key press), never while dragging. */
  onCommit: (score: number) => void;
  onClear?: () => void;
}

/**
 * evaluations.scale rule 7 (PAD-423): a competency on the coach's 1-10, 1-20 or 1-100 is rated
 * with a slider, whole steps, the value beside it ("7/10"). A drag is ONE input, like a star
 * tap (evaluations.records' one-request-per-input rule): the value follows the thumb locally and
 * is saved on release only. Unrated shows "–/10" until the thumb is first moved.
 */
export function ScoreSlider({ id, name, score, scaleMin, scaleMax, onCommit, onClear }: ScoreSliderProps) {
  const { t } = useTranslation();
  // The thumb's position while dragging; the server's score again once it answers.
  const [draft, setDraft] = React.useState<number | null>(null);
  React.useEffect(() => setDraft(null), [score]);
  const shown = draft ?? score;

  return (
    <div className="flex w-full max-w-xs items-center gap-2" data-testid={`evaluation-slider-${id}`}>
      {onClear && (
        // The clear control's place is kept while there is nothing to clear (nothing moves under the finger).
        <span className="inline-flex h-9 w-9 shrink-0" data-testid={`evaluation-slider-${id}-clear-slot`}>
          {score !== null && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClear}
              aria-label={t("players.evaluationHistory.clearScore", { name })} data-testid={`evaluation-slider-${id}-clear`}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </span>
      )}
      <Slider
        min={scaleMin} max={scaleMax} step={1}
        value={[shown ?? scaleMin]}
        onValueChange={([value]) => setDraft(value)}
        onValueCommit={([value]) => onCommit(value)}
        aria-label={name}
        className="min-w-[8rem] flex-1 py-3"
        data-testid={`evaluation-slider-${id}-input`}
        data-unrated={shown === null ? "true" : undefined}
      />
      <span
        // One fixed width, so the value changing never moves the slider (nothing moves under the finger).
        className={"inline-block w-[4.5rem] shrink-0 text-center text-sm " + (shown === null ? "text-muted-foreground" : "font-medium tabular-nums")}
        data-testid={`evaluation-slider-${id}-value`}
        data-score={shown ?? ""}
        aria-label={shown === null ? t("players.evaluationHistory.notRated") : undefined}
      >
        {shown === null
          ? t("players.evaluationHistory.stepperUnrated", { max: scaleMax })
          : t("players.evaluationHistory.stepperValue", { score: shown, max: scaleMax })}
      </span>
    </div>
  );
}
