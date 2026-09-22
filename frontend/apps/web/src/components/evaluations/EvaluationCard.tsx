import { useTranslation } from "react-i18next";
import type { EvaluationCard as EvaluationCardType } from "@levelup/types";
import { competencyLabel, deltaPresentation } from "@levelup/config";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatEvaluationDate } from "./formatEvaluationDate";

interface EvaluationCardProps {
  card: EvaluationCardType;
}

const PERIOD_KEY: Record<EvaluationCardType["evolutionPeriod"], string> = {
  last: "periodLast",
  "6m": "period6m",
  "1y": "period1y",
  none: "periodLast", // unreachable: `none` never carries lines (sharing rule 5), so the period is never shown.
};

/**
 * `evaluations.sharing` rule 3 / `evaluations.student-view` rule 6: ONE component draws
 * the `Card` exactly as the server sent it — the coach's step-2 preview
 * (`ShareEvaluationDialog`, `sharedAt: null`) and the player's own read (the dashboard
 * block, `/evaluations`, `sharedAt` set). It never computes a delta and never re-sorts
 * `ratings`/`evolution` — both already arrive in the coach's competency order (rule 4).
 * A player is never sent a competency id (rule 3), so every rating is shown the same
 * plain way, whatever its original scale.
 */
export function EvaluationCard({ card }: EvaluationCardProps) {
  const { t, i18n } = useTranslation();

  return (
    <Card data-testid={`evaluation-shared-card-${card.recordId}`}>
      <CardHeader className="space-y-1 pb-3">
        <p className="text-sm font-semibold" data-testid="evaluation-shared-card-coach">
          {t("players.evaluationSharing.card.from", { coach: card.coachName ?? "" })}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatEvaluationDate(card.evaluatedOn, i18n.language)}
          {card.className && (
            <span data-testid="evaluation-shared-card-class"> · {card.className}</span>
          )}
        </p>
        {/* `null` on a preview (never shared yet); set once the card is the stored snapshot. */}
        {card.sharedAt && (
          <p className="text-xs text-muted-foreground" data-testid="evaluation-shared-card-shared-at">
            {t("players.evaluationSharing.share.sharedOn", {
              date: formatEvaluationDate(card.sharedAt, i18n.language),
            })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-1.5" data-testid="evaluation-shared-card-ratings">
          {card.ratings.map((rating, index) => (
            <li
              key={`${rating.key ?? rating.name}-${index}`}
              className="flex items-center justify-between gap-2 text-sm"
              data-testid={`evaluation-shared-card-rating-${index}`}
            >
              <span>{competencyLabel(t, rating)}</span>
              <span className="font-medium tabular-nums">
                {rating.score}/{rating.scaleMax}
              </span>
            </li>
          ))}
        </ul>

        {card.evolution.length > 0 && (
          <div className="space-y-1.5" data-testid="evaluation-shared-card-evolution">
            <p className="text-xs font-medium text-muted-foreground">
              {t(`players.evaluationSharing.card.${PERIOD_KEY[card.evolutionPeriod]}`)}
            </p>
            <ul className="space-y-1">
              {card.evolution.map((line, index) => {
                // Reuses `evaluations.evolution`'s own presentation (green for up only,
                // down and flat both neutral) — the two surfaces can never disagree.
                const delta = deltaPresentation({ value: line.delta, sinceMonth: "" });
                return (
                  <li
                    key={`${line.key ?? line.name}-${index}`}
                    className="flex items-center justify-between gap-2 text-sm"
                    data-testid={`evaluation-shared-card-evolution-${index}`}
                  >
                    <span className="text-muted-foreground">{competencyLabel(t, line)}</span>
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        delta?.trend === "up" ? "text-success" : "text-muted-foreground"
                      )}
                    >
                      {delta?.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {card.note && (
          <div className="space-y-1" data-testid="evaluation-shared-card-note">
            <p className="text-xs font-medium text-muted-foreground">
              {t("players.evaluationSharing.card.coachComment")}
            </p>
            <p className="text-sm italic text-muted-foreground">“{card.note}”</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
