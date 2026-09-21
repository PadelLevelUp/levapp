import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { X } from "lucide-react";
import type {
  EvaluationCompetency,
  EvaluationRecord,
  EvaluationRecordInput,
  PutEvaluationRecordResult,
} from "@levelup/types";
import {
  competencyLabel,
  createDebouncedWriter,
  formCompetencies,
  isStarCompetency,
  nextStarScore,
  stepScore,
} from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./StarRating";
import { ScoreStepper } from "./ScoreStepper";

type SaveInput = Omit<EvaluationRecordInput, "playerId">;

interface EvaluationFormProps {
  competencies: EvaluationCompetency[];
  /** The record the form opens on (today's), or null: tapping nothing creates nothing. */
  record: EvaluationRecord | null;
  /** One input = one call. Rejects when the save failed (409 `record_not_editable` included). */
  onSave: (input: SaveInput) => Promise<PutEvaluationRecordResult>;
  onClose: () => void;
  onManageCompetencies: () => void;
}

const STEP_QUIET_MS = 400;
const NOTE_QUIET_MS = 800;
const NOTE_KEY = "note";

/**
 * "Nova avaliação" (evaluations.history rules 4-5, evaluations.records rules 7, 10, 11).
 * Each input saves as it is made; a stepper's consecutive steps are one input and the
 * note is debounced. There is no save button: "Concluir avaliação" flushes what is
 * pending and closes. A failed save is shown and the control rolls back to what the
 * server last accepted.
 */
export function EvaluationForm({ competencies, record, onSave, onClose, onManageCompetencies }: EvaluationFormProps) {
  const { t } = useTranslation();
  const rows = useMemo(() => formCompetencies(competencies, record), [competencies, record]);

  const opened = useMemo(() => {
    const scores: Record<string, number | null> = {};
    for (const rating of record?.ratings ?? []) scores[String(rating.categoryId)] = rating.score;
    return scores;
  }, [record]);
  const [scores, setScores] = useState<Record<string, number | null>>(opened);
  const [note, setNote] = useState(record?.note ?? "");
  const [failed, setFailed] = useState(false);

  // What the server last accepted — the rollback target — and the record's id once it has one.
  const accepted = useRef<{ scores: Record<string, number | null>; note: string; recordId?: number }>({
    scores: { ...opened }, note: record?.note ?? "", recordId: record?.id,
  });
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const save = async (input: SaveInput, rollback: () => void, commit: () => void) => {
    const recordId = accepted.current.recordId;
    try {
      const result = await onSaveRef.current(recordId === undefined ? input : { ...input, recordId });
      accepted.current.recordId = "deleted" in result ? undefined : result.id;
      commit();
      setFailed(false);
    } catch {
      rollback();
      setFailed(true);
      toast.error(t("players.evaluationHistory.saveFailed"));
    }
  };

  const saveScore = (key: string, value: number | null) =>
    save(
      { ratings: { [key]: value } },
      () => setScores((now) => (now[key] === value ? { ...now, [key]: accepted.current.scores[key] ?? null } : now)),
      () => { accepted.current.scores[key] = value; }
    );

  const writers = useMemo(
    () => ({
      steps: createDebouncedWriter<number | null>((key, value) => void saveScore(key, value), STEP_QUIET_MS),
      note: createDebouncedWriter<string>(
        (_key, value) =>
          void save({ note: value }, () => setNote((now) => (now === value ? accepted.current.note : now)),
            () => { accepted.current.note = value; }),
        NOTE_QUIET_MS
      ),
    }),
    // one pair of writers for the form's life; `save` reads its inputs through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const flushAll = () => { writers.steps.flush(); writers.note.flush(); };
  // A quick step-then-close is never lost: unmount flushes too.
  useEffect(() => flushAll, []); // eslint-disable-line react-hooks/exhaustive-deps

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
                onRate={(tapped) => {
                  const next = nextStarScore(score, tapped);
                  setScores((now) => ({ ...now, [key]: next }));
                  void saveScore(key, next);
                }}
              />
            ) : (
              <ScoreStepper
                id={competency.id} name={name} score={score} scaleMin={competency.scaleMin} scaleMax={competency.scaleMax}
                onStep={(delta) => {
                  const next = stepScore(score, delta, competency.scaleMin, competency.scaleMax);
                  setScores((now) => ({ ...now, [key]: next }));
                  writers.steps.schedule(key, next);
                }}
                onClear={() => {
                  setScores((now) => ({ ...now, [key]: null }));
                  writers.steps.schedule(key, null);
                  writers.steps.flush(key);
                }}
              />
            )}
          </div>
        );
      })}

      <div className="space-y-1.5">
        <Label htmlFor="evaluation-note">{t("players.evaluationHistory.note")}</Label>
        <Textarea
          id="evaluation-note" data-testid="evaluation-note" value={note} maxLength={2000} rows={3}
          onChange={(event) => { setNote(event.target.value); writers.note.schedule(NOTE_KEY, event.target.value); }}
          onBlur={() => writers.note.flush()}
        />
      </div>

      {failed && (
        <p className="text-sm text-destructive" role="alert" data-testid="evaluation-save-error">
          {t("players.evaluationHistory.saveFailed")}
        </p>
      )}

      <Button type="button" className="w-full" onClick={() => { flushAll(); onClose(); }} data-testid="evaluation-finish">
        {t("players.evaluationHistory.finish")}
      </Button>
    </div>
  );
}
