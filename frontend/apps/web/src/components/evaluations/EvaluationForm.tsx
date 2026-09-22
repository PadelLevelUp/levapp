import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { EvaluationCompetency, EvaluationRecord, EvaluationRecordInput, PutEvaluationRecordResult } from "@levelup/types";
import { competencyLabel, formCompetencies, isStarCompetency, nextStarScore, stableFormRows, stepScore } from "@levelup/config";
import { useEvaluationFormSession } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./StarRating";
import { ScoreStepper } from "./ScoreStepper";
import { useFlushOnPageHide } from "./useFlushOnPageHide";

type SaveInput = Omit<EvaluationRecordInput, "playerId">;

interface EvaluationFormProps {
  competencies: EvaluationCompetency[];
  /** The record the form opens on (today's), or null: tapping nothing creates nothing. */
  record: EvaluationRecord | null;
  /** One input = one call. Rejects when the save failed (409 `record_not_editable` included). */
  onSave: (input: SaveInput, options?: { keepalive?: boolean }) => Promise<PutEvaluationRecordResult>;
  onClose: () => void;
  onManageCompetencies: () => void;
}

/**
 * "Nova avaliação" (evaluations.history rules 4-5, evaluations.records rules 7, 10, 11).
 * Each input saves as it is made; a stepper's consecutive steps are one input and the
 * note is debounced. There is no save button: "Concluir avaliação" flushes what is
 * pending and closes. A failed save is shown and the control rolls back to what the
 * server last accepted.
 */
export function EvaluationForm({ competencies, record, onSave, onClose, onManageCompetencies }: EvaluationFormProps) {
  const { t } = useTranslation();
  // A row that was listed stays listed while the form is open (Q33's family): clearing a
  // switched-off competency's rating must not make the rows below jump up under the finger.
  const listed = useRef<EvaluationCompetency[]>([]);
  const rows = useMemo(() => {
    listed.current = stableFormRows(listed.current, formCompetencies(competencies, record));
    return listed.current;
  }, [competencies, record]);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // All saving lives in the shared session (packages/config): serialised requests, rollback,
  // the debounced stepper and note, the day-passed 409, and flush on unmount.
  const { session, state } = useEvaluationFormSession({
    record,
    save: (input, options) => (options ? onSaveRef.current(input, options) : onSaveRef.current(input)),
    onFailure: (failure) => toast.error(t(failure === "dayPassed" ? "players.evaluationHistory.dayPassed" : "players.evaluationHistory.saveFailed")),
  });
  const { scores, note, noteUnsaved, failure } = state;
  const flushAll = () => session.flush();
  // A closed tab or a switched-away page never loses the last input (PAD-396).
  useFlushOnPageHide(flushAll);

  if (rows.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-4" data-testid="evaluation-form-empty">
        <p className="text-sm text-muted-foreground">{t("players.evaluationHistory.noCompetencies")}</p>
        <div className="flex gap-2">
          <Button type="button" onClick={onManageCompetencies} data-testid="evaluation-manage-competencies">
            {t("players.evaluationHistory.manageCompetencies")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} data-testid="evaluation-form-close">
            {t("players.evaluationHistory.close")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4" data-testid="evaluation-form">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("players.evaluationHistory.new")}</p>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => { flushAll(); onClose(); }}
          aria-label={t("players.evaluationHistory.close")} data-testid="evaluation-form-close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {rows.map((competency) => {
        const key = String(competency.id);
        const score = scores[key] ?? null;
        const name = competencyLabel(t, competency);
        return (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2" data-testid={`evaluation-row-${key}`}>
            <span className="text-sm font-medium">{name}</span>
            {isStarCompetency(competency) ? (
              <StarRating
                id={competency.id} name={name} score={score} max={competency.scaleMax}
                onRate={(tapped) => session.rate(key, nextStarScore(score, tapped))}
              />
            ) : (
              <ScoreStepper
                id={competency.id} name={name} score={score} scaleMin={competency.scaleMin} scaleMax={competency.scaleMax}
                onStep={(delta) => session.step(key, stepScore(score, delta, competency.scaleMin, competency.scaleMax))}
                onClear={() => session.rate(key, null)}
              />
            )}
          </div>
        );
      })}

      <div className="space-y-1.5">
        <Label htmlFor="evaluation-note">{t("players.evaluationHistory.note")}</Label>
        <Textarea
          id="evaluation-note" data-testid="evaluation-note" value={note} maxLength={2000} rows={3}
          onChange={(event) => session.editNote(event.target.value)}
          onBlur={() => session.flush()}
        />
        {noteUnsaved && (
          // Free text is never rolled back: the coach's words stay, marked unsaved, with a retry.
          <p className="flex items-center gap-2 text-sm text-destructive" role="alert" data-testid="evaluation-note-unsaved">
            {t("players.evaluationHistory.noteUnsaved")}
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => session.retryNote()} data-testid="evaluation-note-retry">
              {t("players.evaluationHistory.retry")}
            </Button>
          </p>
        )}
      </div>

      {failure && (
        <p className="text-sm text-destructive" role="alert" data-testid="evaluation-save-error">
          {t(failure === "dayPassed" ? "players.evaluationHistory.dayPassed" : "players.evaluationHistory.saveFailed")}
        </p>
      )}

      <Button type="button" className="w-full" onClick={() => { flushAll(); onClose(); }} data-testid="evaluation-finish">
        {t("players.evaluationHistory.finish")}
      </Button>
    </div>
  );
}
