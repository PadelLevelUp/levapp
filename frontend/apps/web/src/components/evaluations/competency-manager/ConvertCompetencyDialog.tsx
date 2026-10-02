import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { competencyLabel, strandedSubs, suggestConversion } from "@levelup/config";
import { evaluationApiErrorCode, useConvertEvaluationCompetency, useEvaluationCompetencies } from "@levelup/hooks";
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
import { Checkbox } from "@/components/ui/checkbox";

interface ConvertCompetencyDialogProps {
  /** The legacy row to convert; `null` closes the dialog. */
  competency: EvaluationCompetency | null;
  onClose: () => void;
}

/**
 * PAD-480 (evaluations.competencies rule 18): turns a legacy category into a default category, on the
 * coach's confirmation, and offers to move the default's strays under it. The dialog says what changes,
 * that old versions of the app stop showing it, and that it cannot be undone. Hosted by the manager, not
 * the row: once converted, the row leaves the legacy section, and a failed move must still be said.
 */
export function ConvertCompetencyDialog({ competency, onClose }: ConvertCompetencyDialogProps) {
  const { t } = useTranslation();
  const competencies = useEvaluationCompetencies();
  const convert = useConvertEvaluationCompetency();
  const [target, setTarget] = useState<string | null>(null);
  const [moveStrays, setMoveStrays] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notMoved, setNotMoved] = useState<string[] | null>(null);
  // What the dialog was opened for, held while it is open: the list it read changes under it.
  const [offer, setOffer] = useState<{ name: string; targets: string[] } | null>(null);

  useEffect(() => {
    const suggestion = competency && competencies.data ? suggestConversion(competencies.data, competency) : null;
    setOffer(competency && suggestion ? { name: competency.name.trim(), targets: suggestion.targets } : null);
    setTarget(suggestion?.suggested ?? null);
    setMoveStrays(true);
    setErrorText(null);
    setNotMoved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read only when another row is opened
  }, [competency?.id]);

  const labelOf = (key: string) => competencyLabel(t, { key, name: "" });
  const strays = target && competencies.data && notMoved === null ? strandedSubs(competencies.data, target) : [];
  const label = target ? labelOf(target) : "";

  const confirm = async () => {
    if (!competency || !target || convert.isPending) return;
    setErrorText(null);
    try {
      const out = await convert.mutateAsync({
        id: competency.id,
        catalogueKey: target,
        moveIds: moveStrays ? strays.map((s) => s.id) : [],
      });
      if (out.notMoved.length === 0) return onClose();
      setNotMoved(strays.filter((s) => out.notMoved.includes(s.id)).map((s) => competencyLabel(t, s)));
    } catch (error) {
      const code = evaluationApiErrorCode(error);
      setErrorText(
        code === "default_held" ? t("evaluations.manager.convertDefaultHeld", { label })
          : code === "name_taken" ? t("evaluations.manager.convertNameTaken", { label })
            : t("evaluations.manager.saveFailed"),
      );
    }
  };

  return (
    <AlertDialog open={competency !== null && offer !== null} onOpenChange={(next) => { if (!next && !convert.isPending) onClose(); }}>
      <AlertDialogContent data-testid="competency-convert-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("evaluations.manager.convertTitle", { name: offer?.name ?? "", label })}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {notMoved !== null ? (
              <p data-testid="competency-convert-not-moved" role="alert">
                {t("evaluations.manager.convertNotMoved", { count: notMoved.length, name: offer?.name ?? "", label, names: notMoved.join(", ") })}
              </p>
            ) : (
              <div className="space-y-2">
                <p>{t("evaluations.manager.convertBecomes", { label })}</p>
                <p>{t("evaluations.manager.convertScores")}</p>
                <p data-testid="competency-convert-old-app">{t("evaluations.manager.convertOldApp")}</p>
                <p>{t("evaluations.manager.convertIrreversible")}</p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {notMoved === null ? (
          <div className="space-y-3">
            {offer && offer.targets.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("evaluations.manager.convertTarget")}</span>
                {offer.targets.map((key) => (
                  <Button key={key} size="sm" variant={key === target ? "default" : "outline"}
                    data-testid={`competency-convert-target-${key}`} aria-pressed={key === target}
                    disabled={convert.isPending} onClick={() => setTarget(key)}>
                    {labelOf(key)}
                  </Button>
                ))}
              </div>
            ) : null}
            {strays.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox data-testid="competency-convert-move" checked={moveStrays}
                  disabled={convert.isPending} onCheckedChange={(next) => setMoveStrays(next === true)} />
                {t(strays.every((s) => !s.isActive) ? "evaluations.manager.convertMoveStraysOff" : "evaluations.manager.convertMoveStrays",
                  { names: strays.map((s) => competencyLabel(t, s)).join(", "), label })}
              </label>
            ) : null}
            {errorText ? (
              <p data-testid="competency-convert-failed" role="alert" className="text-xs text-destructive">{errorText}</p>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          {notMoved !== null ? (
            <Button data-testid="competency-convert-done" onClick={onClose}>{t("evaluations.manager.convertDone")}</Button>
          ) : (
            <>
              <AlertDialogCancel data-testid="competency-convert-cancel" disabled={convert.isPending}>
                {t("evaluations.manager.cancel")}
              </AlertDialogCancel>
              <Button data-testid="competency-convert-confirm" disabled={!target || convert.isPending} onClick={() => void confirm()}>
                {t("evaluations.manager.convertConfirm")}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
