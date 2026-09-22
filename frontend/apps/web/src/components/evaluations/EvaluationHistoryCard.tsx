import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil, Share2, Trash2 } from "lucide-react";
import type { EvaluationRecord } from "@levelup/types";
import { competencyLabel } from "@levelup/config";
import { useShareEvaluation, useUnshareEvaluation } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { ShareEvaluationDialog } from "./ShareEvaluationDialog";
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
  /**
   * PAD-402 (`evaluations.sharing`): the sharing controls need the player identified
   * (the mutations, the dialog's step-1 title) — provided by `PlayerEvaluationsDrawer`,
   * the only caller with a player in hand. Omitted, the class panel's earlier-record
   * card (`ClassEvaluationsPanel.tsx`) stays exactly as it was: read-only, share-less.
   */
  playerId?: string;
  playerName?: string;
}

/**
 * One card per record (evaluations.history rules 6-8; evaluations.sharing rules 8, 10):
 * the date and "· {aula}" only when the record has a class; a read-only control per
 * rated competency on that competency's own scale, switched-off ones included; the note
 * in italics and quotes. "Edit" only while the server says `editable`; "delete" and
 * "share" always — ANY record can be shared (sharing rule 10), so the action row's
 * width never changes with `editable` or with the share state. The share-status line
 * and its actions share one reserved line (`min-h-5`) so sharing or un-sharing never
 * shifts the ratings list below ("nothing moves under the finger").
 */
export function EvaluationHistoryCard({ record, isStars, onEdit, onDelete, playerId, playerName }: EvaluationHistoryCardProps) {
  const { t, i18n } = useTranslation();
  const id = record.id;
  const [shareOpen, setShareOpen] = useState(false);
  const share = useShareEvaluation(playerId ?? "");
  const unshare = useUnshareEvaluation(playerId ?? "");
  const busy = share.isPending || unshare.isPending;
  const canShare = Boolean(playerId && playerName);

  // Sharing rule 7's "Atualizar partilha": the SAME POST again with the selection
  // already stored on the record — not the dialog's fresh defaults, which would
  // widen what the player sees.
  const handleUpdateShare = async () => {
    if (!record.share) return;
    const { categoryIds, evolution, includeNote } = record.share;
    try {
      await share.mutateAsync({ recordId: record.id, input: { categoryIds, evolution, includeNote } });
    } catch {
      toast.error(t("players.evaluationSharing.share.error"));
    }
  };

  const handleUnshare = async () => {
    try {
      await unshare.mutateAsync(record.id);
    } catch {
      toast.error(t("players.evaluationSharing.share.error"));
    }
  };

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
          {canShare && (
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShareOpen(true)}
              aria-label={t("players.evaluationSharing.share.action")} data-testid={`evaluation-history-share-${id}`}>
              <Share2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {canShare && (
        // One reserved line (status + its two actions inline), empty when unshared,
        // so sharing or un-sharing never moves the ratings below it.
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 text-xs text-muted-foreground"
          data-testid={`evaluation-history-share-status-${id}`}>
          {record.share && (
            <>
              <span>
                {t("players.evaluationSharing.share.sharedOn", {
                  date: formatEvaluationDate(record.share.sharedAt, i18n.language),
                })}
              </span>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={busy} onClick={() => void handleUnshare()}
                data-testid={`evaluation-history-unshare-${id}`}>
                {t("players.evaluationSharing.share.unshare")}
              </Button>
              {record.share.stale && (
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={busy} onClick={() => void handleUpdateShare()}
                  data-testid={`evaluation-history-update-share-${id}`}>
                  {t("players.evaluationSharing.share.update")}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {canShare && (
        <ShareEvaluationDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          record={record}
          playerId={playerId as string}
          playerName={playerName as string}
        />
      )}

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
