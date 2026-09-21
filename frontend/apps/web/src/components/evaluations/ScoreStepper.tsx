import { Minus, Plus, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

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
 */
export function ScoreStepper({ id, name, score, scaleMin, scaleMax, onStep, onClear }: ScoreStepperProps) {
  const { t } = useTranslation();
  const value = (
    <span
      className={score === null ? "text-sm text-muted-foreground" : "text-sm font-medium tabular-nums"}
      data-testid={`evaluation-stepper-${id}-value`}
      data-score={score ?? ""}
    >
      {score === null
        ? t("players.evaluationHistory.notRated")
        : t("players.evaluationHistory.stepperValue", { score, max: scaleMax })}
    </span>
  );
  if (!onStep) return value;

  return (
    <div className="flex items-center gap-2">
      {score !== null && onClear && (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onClear}
          aria-label={t("players.evaluationHistory.clearScore", { name })} data-testid={`evaluation-stepper-${id}-clear`}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => onStep(-1)}
        disabled={score !== null && score <= scaleMin}
        aria-label={t("players.evaluationHistory.stepDown", { name })} data-testid={`evaluation-stepper-${id}-minus`}>
        <Minus className="h-4 w-4" />
      </Button>
      <span className="min-w-[4.5rem] text-center">{value}</span>
      <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => onStep(1)}
        disabled={score !== null && score >= scaleMax}
        aria-label={t("players.evaluationHistory.stepUp", { name })} data-testid={`evaluation-stepper-${id}-plus`}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
