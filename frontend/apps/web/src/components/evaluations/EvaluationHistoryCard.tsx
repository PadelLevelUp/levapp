import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import type { EvaluationRecord } from "@levelup/types";
import { competencyLabel } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { StarRating } from "./StarRating";
import { ScoreStepper } from "./ScoreStepper";
import { formatEvaluationDate } from "./formatEvaluationDate";

interface EvaluationHistoryCardProps {
  record: EvaluationRecord;
  /** A rating is drawn as stars when its competency is a 1-5 one; legacy scales are "n/max". */
  isStars: (categoryId: number) => boolean;
  /** Both absent = a read-only card (the class panel's earlier-day record, PAD-376): no actions at all. */
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * One card per record (evaluations.history rules 6-8): the date and "· {aula}" only
 * when the record has a class; a read-only control per rated competency on that
 * competency's own scale, switched-off ones included; the note in italics and
 * quotes. "Edit" only while the server says `editable`; "delete" always. No share
 * control — that is `evaluations.sharing` (slice 7).
 */
export function EvaluationHistoryCard({ record, isStars, onEdit, onDelete }: EvaluationHistoryCardProps) {
  const { t, i18n } = useTranslation();
  const id = record.id;
  return (
    <article className="space-y-3 rounded-lg border p-4" data-testid={`evaluation-history-card-${id}`}>
      <header className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          {formatEvaluationDate(record.evaluatedOn, i18n.language)}
          {record.className && (
            <span className="font-normal text-muted-foreground" data-testid="evaluation-history-class"> · {record.className}</span>
          )}
        </p>
        <div className="flex gap-1">
          {record.editable && onEdit && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={onEdit}
              aria-label={t("players.evaluationHistory.edit")} data-testid={`evaluation-history-edit-${id}`}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={onDelete}
              aria-label={t("players.evaluationHistory.delete")} data-testid={`evaluation-history-delete-${id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      <ul className="space-y-1.5">
        {record.ratings.map((rating) => {
          const name = competencyLabel(t, rating);
          return (
            <li key={rating.categoryId} className="flex items-center justify-between gap-2 text-sm">
              <span>{name}</span>
              {isStars(rating.categoryId) ? (
                <StarRating id={rating.categoryId} name={name} score={rating.score} max={rating.scaleMax} size="sm" />
              ) : (
                <ScoreStepper id={rating.categoryId} name={name} score={rating.score} scaleMin={rating.scaleMin} scaleMax={rating.scaleMax} />
              )}
            </li>
          );
        })}
      </ul>

      {record.note && (
        <p className="text-sm italic text-muted-foreground" data-testid="evaluation-history-note">“{record.note}”</p>
      )}
      {!record.editable && (
        <p className="text-xs text-muted-foreground">{t("players.evaluationHistory.readOnlyHint")}</p>
      )}
    </article>
  );
}
