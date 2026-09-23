import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { EvaluationCard as EvaluationCardType, EvaluationRecord, EvaluationShareEvolution } from "@levelup/types";
import { canPreview, competencyLabel, initialShareSelection, shareInput, toggleCategory, type ShareSelection } from "@levelup/config";
import { useShareEvaluation, useShareEvaluationPreview } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { EvaluationCard } from "./EvaluationCard";

interface ShareEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: EvaluationRecord;
  playerId: string;
  /** The player's full name; only the first name is used in the step-1 title. */
  playerName: string;
}

const EVOLUTION_OPTIONS: { value: EvaluationShareEvolution; labelKey: string }[] = [
  { value: "last", labelKey: "evolutionLast" },
  { value: "6m", labelKey: "evolution6m" },
  { value: "1y", labelKey: "evolution1y" },
  { value: "none", labelKey: "evolutionNone" },
];

/**
 * `evaluations.sharing` rules 2-3, 6, 13-14 (PAD-402): "Partilhar avaliação", a two-step
 * modal — a separate surface, so nothing on the history card behind it ever moves. Step 1
 * chooses what to show (pre-ticked via `initialShareSelection`, sharing rule 2); Step 2 is
 * the server's preview, rendered by the SAME `EvaluationCard` the player's own read uses
 * (rule 3) — "Voltar" keeps the selection, "Partilhar" commits it. Both steps offer an
 * explicit cancel besides the scrim (rule 13); cancelling at either step writes nothing.
 */
export function ShareEvaluationDialog({ open, onOpenChange, record, playerId, playerName }: ShareEvaluationDialogProps) {
  const { t } = useTranslation();
  const firstName = playerName.trim().split(" ")[0] ?? playerName;

  const [step, setStep] = useState<1 | 2>(1);
  const [selection, setSelection] = useState<ShareSelection>(() => initialShareSelection(record));
  const [previewCard, setPreviewCard] = useState<EvaluationCardType | null>(null);

  // A fresh open always starts step 1 with the record's own defaults (sharing rule 2) —
  // "Atualizar partilha" opens this same dialog, not a re-hydration of the prior share.
  useEffect(() => {
    if (open) {
      setStep(1);
      setSelection(initialShareSelection(record));
      setPreviewCard(null);
    }
  }, [open, record]);

  const preview = useShareEvaluationPreview();
  const share = useShareEvaluation(playerId);

  const handlePreview = async () => {
    try {
      const card = await preview.mutateAsync({ recordId: record.id, input: shareInput(selection) });
      setPreviewCard(card);
      setStep(2);
    } catch {
      toast.error(t("players.evaluationSharing.share.error"));
    }
  };

  const handleSubmit = async () => {
    try {
      await share.mutateAsync({ recordId: record.id, input: shareInput(selection) });
      onOpenChange(false);
    } catch {
      toast.error(t("players.evaluationSharing.share.error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="share-evaluation-dialog" className="max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("players.evaluationSharing.share.step1Title", { name: firstName })}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <ul className="space-y-2.5" data-testid="share-competencies">
                {record.ratings.map((rating) => {
                  const checked = selection.categoryIds.includes(rating.categoryId);
                  return (
                    <li key={rating.categoryId} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`share-category-${rating.categoryId}`}
                        checked={checked}
                        onCheckedChange={() => setSelection((current) => toggleCategory(current, rating.categoryId))}
                        data-testid={`share-category-${rating.categoryId}`}
                      />
                      <Label htmlFor={`share-category-${rating.categoryId}`} className="text-sm font-normal">
                        {t("players.evaluationSharing.share.competencyOption", {
                          name: competencyLabel(t, rating),
                          score: rating.score,
                          max: rating.scaleMax,
                        })}
                      </Label>
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("players.evaluationSharing.share.evolutionLabel")}
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("players.evaluationSharing.share.evolutionLabel")}>
                  {EVOLUTION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelection((current) => ({ ...current, evolution: option.value }))}
                      aria-pressed={selection.evolution === option.value}
                      data-testid={`share-evolution-${option.value}`}
                      className={cn(
                        "min-h-9 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selection.evolution === option.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-accent"
                      )}
                    >
                      {t(`players.evaluationSharing.share.${option.labelKey}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Only when the record has a note (sharing rule 2), and off by default even then. */}
              {record.note && (
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="share-include-note" className="text-sm font-normal">
                    {t("players.evaluationSharing.share.includeNote")}
                  </Label>
                  <Switch
                    id="share-include-note"
                    checked={selection.includeNote}
                    onCheckedChange={(checked) => setSelection((current) => ({ ...current, includeNote: checked }))}
                    data-testid="share-include-note"
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="share-cancel">
                {t("players.evaluationSharing.share.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void handlePreview()}
                disabled={!canPreview(selection) || preview.isPending}
                data-testid="share-preview"
              >
                {t("players.evaluationSharing.share.preview")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("players.evaluationSharing.share.previewTitle")}</DialogTitle>
            </DialogHeader>

            {previewCard && <EvaluationCard card={previewCard} />}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="share-cancel">
                {t("players.evaluationSharing.share.cancel")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep(1)} data-testid="share-back">
                {t("players.evaluationSharing.share.back")}
              </Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={share.isPending} data-testid="share-submit">
                {t("players.evaluationSharing.share.submit")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
