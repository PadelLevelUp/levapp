import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeleteEvaluationCompetency, useEvaluationCompetencyImpact } from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteCompetencyDialogProps {
  /** The custom or legacy competency to delete; `null` closes the dialog. */
  competency: EvaluationCompetency | null;
  /** PAD-431 (rule 9): the sub-categories deleted with a category, named so nothing goes unseen. */
  subNames?: string[];
  onClose: () => void;
}

/**
 * Deleting a competency deletes every score on it, so PAD-274's safeguards stay exactly
 * as they were (evaluations.competencies rule 9): the impact is read first, the coach
 * types the name, and the server writes the audit row. All through the NEW endpoints —
 * the legacy delete is frozen for the App Store builds.
 */
export function DeleteCompetencyDialog({ competency, subNames = [], onClose }: DeleteCompetencyDialogProps) {
  const { t } = useTranslation();
  const impact = useEvaluationCompetencyImpact(competency?.id ?? null, competency !== null);
  const remove = useDeleteEvaluationCompetency();
  const [typedName, setTypedName] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setTypedName("");
    setFailed(false);
  }, [competency?.id]);

  // The name to type is the ROW's (what the coach sees in the title); the impact carries the
  // counts and must be read before a delete can be confirmed (rule 9). Session-B, #361.
  const nameMatches = impact.data !== undefined && competency !== null && typedName.trim() === competency.name.trim();

  const confirm = async () => {
    if (!competency || !nameMatches || remove.isPending) return;
    setFailed(false);
    try {
      await remove.mutateAsync(competency.id);
      onClose();
    } catch {
      setFailed(true);
    }
  };

  return (
    <AlertDialog open={competency !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AlertDialogContent data-testid="competency-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("evaluations.manager.deleteTitle", { name: competency?.name ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {impact.isError ? (
                <p data-testid="competency-delete-impact-failed" role="alert" className="text-destructive">
                  {t("evaluations.manager.impactFailed")}
                </p>
              ) : impact.data ? (
                <p data-testid="competency-delete-impact">
                  {impact.data.scores > 0
                    ? t("evaluations.manager.deleteImpact", { scores: impact.data.scores, players: impact.data.players })
                    : t("evaluations.manager.deleteImpactNone")}
                </p>
              ) : null}
              {subNames.length > 0 ? (
                <p data-testid="competency-delete-subs">
                  {t("evaluations.manager.deleteSubCategories", { names: subNames.join(", ") })}
                </p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="competency-delete-name">{t("evaluations.manager.deleteTypeName")}</Label>
          <Input
            id="competency-delete-name"
            data-testid="competency-delete-name"
            value={typedName}
            autoComplete="off"
            onChange={(e) => setTypedName(e.target.value)}
          />
          {failed ? (
            <p data-testid="competency-delete-failed" role="alert" className="text-xs text-destructive">
              {t("evaluations.manager.saveFailed")}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="competency-delete-cancel" disabled={remove.isPending}>{t("evaluations.manager.cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            data-testid="competency-delete-confirm"
            disabled={!nameMatches || remove.isPending}
            onClick={() => void confirm()}
          >
            {t("evaluations.manager.deleteConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
