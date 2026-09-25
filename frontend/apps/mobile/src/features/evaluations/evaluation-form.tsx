import { Ionicons } from "@expo/vector-icons";
import {
  competencyLabel,
  formCompetencies,
  lightTheme,
  nextStarScore,
  ratingInputKind,
  stableFormRows,
  stepScore,
} from "@levelup/config";
import { useEvaluationFormSession } from "@levelup/hooks";
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

import { ScoreSlider } from "./score-slider";
import { ScoreStepper } from "./score-stepper";
import { StarRating } from "./star-rating";
import { useFlushOnBackground } from "./use-flush-on-background";

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
  // A row that was listed stays listed while the form is open (Q33's family).
  const listed = React.useRef<EvaluationCompetency[]>([]);
  const rows = React.useMemo(() => {
    listed.current = stableFormRows(listed.current, formCompetencies(competencies, record));
    return listed.current;
  }, [competencies, record]);

  const onSaveRef = React.useRef(onSave);
  onSaveRef.current = onSave;
  // All saving lives in the shared session (packages/config) — the same one web renders:
  // serialised requests, rollback, the debounced stepper and note, the day-passed 409, flush on unmount.
  const { session, state } = useEvaluationFormSession({
    record,
    save: (input) => onSaveRef.current(input),
    onFailure: (failure) => toast.error(t(failure === "dayPassed" ? "players.evaluationHistory.dayPassed" : "players.evaluationHistory.saveFailed")),
  });
  const { scores, note, noteUnsaved, failure } = state;
  const flushAll = () => session.flush();
  // A backgrounded app never loses the last input (PAD-396).
  useFlushOnBackground(flushAll);

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
        const input = ratingInputKind(competency); // evaluations.scale rule 7
        return (
          <View key={key} className="gap-1" testID={`evaluation-row-${key}`}>
            <Text className="text-sm font-medium">{name}</Text>
            {input === "stars" ? (
              <StarRating
                id={competency.id} name={name} score={score} max={competency.scaleMax}
                onRate={(tapped) => session.rate(key, nextStarScore(score, tapped))}
              />
            ) : input === "slider" ? (
              <ScoreSlider
                id={competency.id} name={name} score={score} scaleMin={competency.scaleMin} scaleMax={competency.scaleMax}
                onCommit={(value) => session.rate(key, value)}
                onClear={() => session.rate(key, null)}
              />
            ) : (
              <ScoreStepper
                id={competency.id} name={name} score={score} scaleMin={competency.scaleMin} scaleMax={competency.scaleMax}
                onStep={(delta) => session.step(key, stepScore(score, delta, competency.scaleMin, competency.scaleMax))}
                onClear={() => session.rate(key, null)}
              />
            )}
          </View>
        );
      })}

      <View className="gap-1.5">
        <Label nativeID="evaluation-note-label">{t("players.evaluationHistory.note")}</Label>
        <Textarea
          testID="evaluation-note" aria-labelledby="evaluation-note-label" value={note} maxLength={2000}
          onChangeText={(text) => session.editNote(text)}
          onBlur={() => session.flush()}
        />
        {noteUnsaved ? (
          // Free text is never rolled back: the coach's words stay, marked unsaved, with a retry.
          <View className="flex-row items-center gap-2" testID="evaluation-note-unsaved">
            <Text className="text-sm text-destructive" accessibilityRole="alert">{t("players.evaluationHistory.noteUnsaved")}</Text>
            <Button variant="link" size="sm" onPress={() => session.retryNote()} testID="evaluation-note-retry">
              <Text>{t("players.evaluationHistory.retry")}</Text>
            </Button>
          </View>
        ) : null}
      </View>

      {failure ? (
        <Text className="text-sm text-destructive" accessibilityRole="alert" testID="evaluation-save-error">
          {t(failure === "dayPassed" ? "players.evaluationHistory.dayPassed" : "players.evaluationHistory.saveFailed")}
        </Text>
      ) : null}

      <Button onPress={() => { flushAll(); onClose(); }} testID="evaluation-finish">
        <Text>{t("players.evaluationHistory.finish")}</Text>
      </Button>
    </View>
  );
}
