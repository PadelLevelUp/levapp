import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import type { ClassEvaluationsActionState } from "@levelup/config";
import { Button } from "@/components/ui/button";

interface ClassEvaluationsActionProps {
  /** `classEvaluationsAction(...)` — the server's answer, never a date compared on the client. */
  state: ClassEvaluationsActionState;
  onOpen: () => void;
  /** For the `error` state: the read failed for a reason other than "not the owner" — try again. */
  onRetry?: () => void;
}

/**
 * "Avaliações", the class detail's primary action (evaluations.class-panel rules 1, 10).
 * Hidden for a student, a non-class event and a class the coach does not own; disabled
 * with a one-line explanation for a past occurrence that was never opened — rating it
 * would have to materialise a class that is over.
 */
export function ClassEvaluationsAction({ state, onOpen, onRetry }: ClassEvaluationsActionProps) {
  const { t } = useTranslation();
  const hintId = useId();
  if (state === "hidden") return null;
  if (state === "error") {
    // Not "not the owner": a 502, a dropped connection. Its own state, with a retry.
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 p-2" data-testid="class-eval-error">
        <p className="text-xs text-destructive" role="alert">{t("players.classEvaluations.loadError")}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} data-testid="class-eval-retry">
          {t("players.evaluationHistory.retry")}
        </Button>
      </div>
    );
  }
  const unavailable = state === "unavailable";

  return (
    <div className="space-y-1.5">
      <Button type="button" className="w-full" onClick={onOpen} disabled={state !== "available"}
        aria-describedby={unavailable ? hintId : undefined} data-testid="class-evaluations-open">
        <Star className="mr-2 h-4 w-4" />
        {t("players.classEvaluations.open")}
      </Button>
      {unavailable && (
        <p id={hintId} className="text-xs text-muted-foreground" data-testid="class-eval-unavailable">
          {t("players.classEvaluations.unavailable")}
        </p>
      )}
    </div>
  );
}
