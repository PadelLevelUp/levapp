import { useTranslation } from "react-i18next";
import { History, Pencil, Plus } from "lucide-react";
import type { EvaluationRecord } from "@levelup/types";
import { EVOLUTION_MIN_RECORDS, competencyLabel, isStarScale } from "@levelup/config";
import { useEvaluationCompetencies, usePlayerEvaluations } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EvaluationEvolution } from "./EvaluationEvolution";
import { ScoreStepper } from "./ScoreStepper";
import { StarRating } from "./StarRating";
import { formatEvaluationDate } from "./formatEvaluationDate";

interface PlayerEvaluationsBlockProps {
  playerId: string;
  /** The signed-in coach's display name: records are per coach, so the author is always them. */
  authorName: string;
  /** "Histórico (N)": the drawer, on its history. */
  onOpenHistory: () => void;
  /** "Nova avaliação" / "Fazer primeira avaliação": the drawer with the form open. */
  onNew: () => void;
  /** The last evaluation's Editar: the drawer's form on that record. */
  onEdit: (record: EvaluationRecord) => void;
  /** True while the drawer's form is open: the evolution holds its shape (evaluations.evolution rule 12). */
  held?: boolean;
}

/**
 * players.profile rule 10 (PAD-834): Block 2, Avaliações. Left, the last evaluation (author,
 * competencies on their own scales, note, Editar only today); right, Evolução once the link has
 * EVOLUTION_MIN_RECORDS records. "Histórico (N)" is always there and keeps the drawer's entry id
 * (`player-evaluations-open`); the date line keeps `evaluation-card-last`. Every figure is the
 * server's (R-048).
 */
export function PlayerEvaluationsBlock({ playerId, authorName, onOpenHistory, onNew, onEdit, held = false }: PlayerEvaluationsBlockProps) {
  const { t, i18n } = useTranslation();
  const history = usePlayerEvaluations(playerId);
  const competencySet = useEvaluationCompetencies();
  const records = history.data?.records ?? [];
  const last = records[0];
  const lastEvaluatedOn = history.data?.lastEvaluatedOn;
  const ready = Boolean(history.data && competencySet.data);

  return (
    <Card data-testid="evaluation-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-lg">{t("players.card.evaluationsTitle")}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpenHistory} data-testid="player-evaluations-open">
            <History className="mr-2 h-4 w-4" />
            {t("players.card.historyCount", { count: records.length })}
          </Button>
          <Button type="button" size="sm" onClick={onNew} disabled={!ready} data-testid="profile-evaluations-new">
            <Plus className="mr-2 h-4 w-4" />
            {t("players.evaluationHistory.new")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground" data-testid="evaluation-card-last">
          {lastEvaluatedOn === undefined
            ? " "
            : lastEvaluatedOn === null
              ? t("players.evaluationHistory.none")
              : t("players.evaluationHistory.lastEvaluated", { date: formatEvaluationDate(lastEvaluatedOn, i18n.language) })}
        </p>

        {history.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : history.isError ? (
          <p className="text-sm text-destructive" role="alert">{t("players.evaluationHistory.loadFailed")}</p>
        ) : !last ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4" data-testid="profile-evaluations-empty">
            <Button type="button" onClick={onNew} disabled={!ready} data-testid="profile-evaluations-first">
              <Plus className="mr-2 h-4 w-4" />
              {t("players.card.firstEvaluation")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="space-y-3" data-testid="profile-evaluation-last" data-record-id={last.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t("players.card.lastEvaluation")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {formatEvaluationDate(last.evaluatedOn, i18n.language)}
                    {last.className ? ` · ${last.className}` : ""}
                    {authorName ? (
                      <span data-testid="profile-evaluation-last-author" data-author={authorName}>
                        {` · ${t("players.card.by", { name: authorName })}`}
                      </span>
                    ) : null}
                  </p>
                </div>
                {last.editable && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(last)} data-testid="profile-evaluation-last-edit">
                    <Pencil className="mr-1 h-4 w-4" />
                    {t("players.evaluationHistory.edit")}
                  </Button>
                )}
              </div>
              <ul className="space-y-1.5">
                {last.ratings.map((rating) => {
                  const name = competencyLabel(t, rating);
                  return (
                    <li key={rating.categoryId} className="flex items-center justify-between gap-2 text-sm">
                      <span>{name}</span>
                      {isStarScale(rating) ? (
                        <StarRating id={rating.categoryId} name={name} score={rating.score} max={rating.scaleMax} size="sm" />
                      ) : (
                        <ScoreStepper id={rating.categoryId} name={name} score={rating.score} scaleMin={rating.scaleMin} scaleMax={rating.scaleMax} />
                      )}
                    </li>
                  );
                })}
              </ul>
              {last.note && (
                <p className="text-sm italic text-muted-foreground" data-testid="profile-evaluation-last-note">“{last.note}”</p>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("players.evaluationHistory.evolution")}</h3>
              {records.length >= EVOLUTION_MIN_RECORDS ? (
                <div data-testid="evaluation-evolution">
                  <EvaluationEvolution
                    playerId={playerId}
                    competencies={competencySet.data?.competencies ?? []}
                    competenciesWithData={history.data?.competenciesWithData ?? []}
                    held={held}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="profile-evolution-gate">
                  {t("players.card.evolutionGate")}
                </p>
              )}
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
