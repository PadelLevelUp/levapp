import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { EvaluationRecord } from "@levelup/types";
import { isStarCompetency, todaysClasslessRecord } from "@levelup/config";
import {
  useDeleteEvaluationRecord,
  useEvaluationCompetencies,
  usePlayerEvaluations,
  usePutEvaluationRecord,
} from "@levelup/hooks";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EvaluationEvolution } from "./EvaluationEvolution";
import { EvaluationForm } from "./EvaluationForm";
import { EvaluationHistoryCard } from "./EvaluationHistoryCard";
import { formatEvaluationDate } from "./formatEvaluationDate";
import { openCompetencyManager } from "./openCompetencyManager";

interface PlayerEvaluationsDrawerProps {
  open: boolean;
  playerId: string;
  playerName: string;
  onClose: () => void;
}

/** `"new"` = today's class-less record (or none yet); a record = that record, with its class. */
type FormTarget = "new" | EvaluationRecord | null;

/**
 * "Avaliações — {nome}" (evaluations.history rule 3): a 520 px drawer on desktop,
 * the full width of a phone. Two sections — "Evolução" (`EvaluationEvolution`, PAD-375) and
 * "Histórico". The drawer owns its state (rule 10): closing it closes the form, and
 * it is keyed by player so another player never inherits a form.
 */
export function PlayerEvaluationsDrawer({ open, playerId, playerName, onClose }: PlayerEvaluationsDrawerProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const history = usePlayerEvaluations(playerId, open);
  const competencySet = useEvaluationCompetencies(open);
  const put = usePutEvaluationRecord(playerId);
  const remove = useDeleteEvaluationRecord(playerId);

  const [target, setTarget] = useState<FormTarget>(null);
  const [deleting, setDeleting] = useState<EvaluationRecord | null>(null);
  useEffect(() => {
    if (!open) { setTarget(null); setDeleting(null); }
  }, [open, playerId]);

  const records = history.data?.records ?? [];
  const competencies = competencySet.data?.competencies ?? [];
  const starIds = useMemo(
    () => new Set(competencies.filter(isStarCompetency).map((competency) => competency.id)),
    [competencies]
  );
  // A rating whose competency was deleted is not in the set; its own scale still says what it was.
  const isStars = (categoryId: number) =>
    starIds.has(categoryId) ||
    (!competencies.some((c) => c.id === categoryId) &&
      records.some((r) => r.ratings.some((x) => x.categoryId === categoryId && x.key !== null)));

  const formRecord = target === "new" ? todaysClasslessRecord(records) : target;
  const classRef =
    target && target !== "new" && target.classInstanceId !== null
      ? { model: "LessonInstance", id: target.classInstanceId }
      : undefined;

  const confirmDelete = async () => {
    if (!deleting) return;
    const date = formatEvaluationDate(deleting.evaluatedOn, i18n.language);
    try {
      await remove.mutateAsync(deleting.id);
      toast.success(t("players.evaluationHistory.deleted", { date }));
      if (target && target !== "new" && target.id === deleting.id) setTarget(null);
    } catch {
      toast.error(t("players.evaluationHistory.deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]" data-testid="player-evaluations-drawer">
        <SheetHeader>
          <SheetTitle>{t("players.evaluationHistory.title", { name: playerName })}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-8">
          <section className="space-y-3" data-testid="evaluation-evolution">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("players.evaluationHistory.evolution")}
            </h3>
            <EvaluationEvolution
              playerId={playerId}
              competencies={competencies}
              competenciesWithData={history.data?.competenciesWithData ?? []}
              held={target !== null}
            />
          </section>

          <section className="space-y-3" data-testid="evaluation-history">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("players.evaluationHistory.history")}
              </h3>
              {target === null && (
                // Not before BOTH reads are in: tapped early, the form showed the zero-competency
                // state falsely, or opened blank over today's record and a typed note replaced it.
                <Button type="button" variant="outline" size="sm" onClick={() => setTarget("new")} data-testid="evaluation-new"
                  disabled={!history.data || !competencySet.data}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("players.evaluationHistory.new")}
                </Button>
              )}
            </div>

            {target !== null && (
              <EvaluationForm
                key={target === "new" ? "new" : target.id}
                competencies={competencies}
                record={formRecord}
                onSave={(input, options) => put.mutateAsync({ ...input, ...(classRef ? { classRef } : {}), keepalive: options?.keepalive })}
                onClose={() => setTarget(null)}
                onManageCompetencies={() => openCompetencyManager(navigate)}
              />
            )}

            {history.isError && (
              <p className="text-sm text-destructive" role="alert">{t("players.evaluationHistory.loadFailed")}</p>
            )}
            {!history.isLoading && !history.isError && records.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="evaluation-history-empty">
                {t("players.evaluationHistory.historyEmpty")}
              </p>
            )}
            {records.map((record) => (
              <EvaluationHistoryCard
                key={record.id}
                record={record}
                isStars={isStars}
                onEdit={() => setTarget(record)}
                onDelete={() => setDeleting(record)}
              />
            ))}
          </section>
        </div>

        <AlertDialog open={deleting !== null} onOpenChange={(next) => !next && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="evaluation-delete-title">
                {deleting && t("players.evaluationHistory.deleteTitle", { date: formatEvaluationDate(deleting.evaluatedOn, i18n.language) })}
              </AlertDialogTitle>
              <AlertDialogDescription>{t("players.evaluationHistory.deleteDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete(); }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="evaluation-delete-confirm">
                {t("players.evaluationHistory.deleteConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
