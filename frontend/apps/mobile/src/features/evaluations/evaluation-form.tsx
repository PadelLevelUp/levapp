import { Ionicons } from "@expo/vector-icons";
import {
  competencyLabel,
  createDebouncedWriter,
  formCompetencies,
  isStarCompetency,
  lightTheme,
  nextStarScore,
  stepScore,
} from "@levelup/config";
import type {
  EvaluationCompetency,
  EvaluationRecord,
  EvaluationRecordInput,
  PutEvaluationRecordResult,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

import { ScoreStepper } from "./score-stepper";
import { StarRating } from "./star-rating";

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
 * "Nova avaliação" on iOS — the same rules as web's `EvaluationForm`
 * (evaluations.history rules 4-5, evaluations.records rules 7, 10, 11), and the
 * same shared logic from `@levelup/config`: each input saves as it is made; a
 * stepper's consecutive steps are one input and the note is debounced; "Concluir
 * avaliação", close, blur and unmount flush. A failed save is shown and the control
 * rolls back to what the server last accepted. Rendered inline in a pushed screen —
 * never inside a native Modal.
 */
export function EvaluationForm({ competencies, record, onSave, onClose, onManageCompetencies }: EvaluationFormProps) {
  const { t } = useTranslation();
  const rows = React.useMemo(() => formCompetencies(competencies, record), [competencies, record]);

  const opened = React.useMemo(() => {
    const scores: Record<string, number | null> = {};
    for (const rating of record?.ratings ?? []) scores[String(rating.categoryId)] = rating.score;
    return scores;
  }, [record]);
  const [scores, setScores] = React.useState<Record<string, number | null>>(opened);
  const [note, setNote] = React.useState(record?.note ?? "");
  const [failed, setFailed] = React.useState(false);

  const accepted = React.useRef<{ scores: Record<string, number | null>; note: string; recordId?: number }>({
    scores: { ...opened }, note: record?.note ?? "", recordId: record?.id,
  });
  const onSaveRef = React.useRef(onSave);
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

  const writers = React.useMemo(
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
  // A quick step-then-back is never lost: unmount flushes too.
  React.useEffect(() => flushAll, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) {
    return (
      <View className="gap-3 rounded-lg border border-dashed border-border p-4" testID="evaluation-form-empty">
        <Text className="text-sm text-muted-foreground">{t("players.evaluationHistory.noCompetencies")}</Text>
        <View className="flex-row gap-2">
          <Button onPress={onManageCompetencies} testID="evaluation-manage-competencies">
            <Text>{t("players.evaluationHistory.manageCompetencies")}</Text>
          </Button>
          <Button variant="outline" onPress={onClose} testID="evaluation-form-close">
            <Text>{t("players.evaluationHistory.close")}</Text>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4 rounded-lg border border-border bg-card p-4" testID="evaluation-form">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold">{t("players.evaluationHistory.new")}</Text>
        <Button variant="ghost" size="icon" testID="evaluation-form-close"
          accessibilityLabel={t("players.evaluationHistory.close")} onPress={() => { flushAll(); onClose(); }}>
          <Ionicons name="close" size={20} color={lightTheme.foreground} />
        </Button>
      </View>

      {rows.map((competency) => {
        const key = String(competency.id);
        const score = scores[key] ?? null;
        const name = competencyLabel(t, competency);
        return (
          <View key={key} className="gap-1" testID={`evaluation-row-${key}`}>
            <Text className="text-sm font-medium">{name}</Text>
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
          </View>
        );
      })}

      <View className="gap-1.5">
        <Label nativeID="evaluation-note-label">{t("players.evaluationHistory.note")}</Label>
        <Textarea
          testID="evaluation-note" aria-labelledby="evaluation-note-label" value={note} maxLength={2000}
          onChangeText={(text) => { setNote(text); writers.note.schedule(NOTE_KEY, text); }}
          onBlur={() => writers.note.flush()}
        />
      </View>

      {failed ? (
        <Text className="text-sm text-destructive" accessibilityRole="alert" testID="evaluation-save-error">
          {t("players.evaluationHistory.saveFailed")}
        </Text>
      ) : null}

      <Button onPress={() => { flushAll(); onClose(); }} testID="evaluation-finish">
        <Text>{t("players.evaluationHistory.finish")}</Text>
      </Button>
    </View>
  );
}
