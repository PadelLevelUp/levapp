import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { CoachLevel } from "@levelup/types";
import type {
  CourtDiagramV2,
  Difficulty,
  Exercise,
  ExercisePayload,
  ExerciseType,
} from "@levelup/types";
import { DIFFICULTY_OPTIONS, EXERCISE_TYPE_OPTIONS } from "@levelup/types";
import { isPristineGameDiagram, upgradeCourtDiagram } from "@levelup/config";
import { exerciseFormSchema } from "@levelup/validation";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { TacticalBoard } from "@/features/training/board/tactical-board";
import { cn } from "@/lib/utils";

type ExerciseFormProps = {
  /** When set, the form edits this exercise; otherwise it creates a new one. */
  exercise: Exercise | null;
  levels: CoachLevel[];
  saving: boolean;
  onSubmit: (payload: ExercisePayload) => void;
  onCancel: () => void;
  /** Only offered while editing; parent shows the confirm dialog. */
  onDelete?: () => void;
};

/**
 * Exercise create/edit form, mirroring the web ExerciseFormSheet. The court
 * diagram lives in a collapsible section (collapsed by default to keep the
 * form compact) hosting the touch port of web's TacticalBoard. Legacy diagrams
 * are upgraded on read and saved back as v2 (training.tactical-board rule 12).
 */
export function ExerciseForm({
  exercise,
  levels,
  saving,
  onSubmit,
  onCancel,
  onDelete,
}: ExerciseFormProps) {
  const { t } = useTranslation();
  const [name, setName] = React.useState(exercise?.name ?? "");
  const [description, setDescription] = React.useState(
    exercise?.description ?? ""
  );
  const [type, setType] = React.useState<ExerciseType>(
    exercise?.type ?? "attack"
  );
  const [customType, setCustomType] = React.useState(
    exercise?.customType ?? ""
  );
  const [difficulty, setDifficulty] = React.useState<Difficulty>(
    exercise?.difficulty ?? 3
  );
  const [levelIds, setLevelIds] = React.useState<string[]>(
    exercise?.levelIds ?? []
  );
  const [notes, setNotes] = React.useState(exercise?.notes ?? "");
  const [diagram, setDiagram] = React.useState<CourtDiagramV2>(() =>
    upgradeCourtDiagram(exercise?.diagram)
  );
  const [diagramOpen, setDiagramOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // EXERCISE_TYPE_OPTIONS / DIFFICULTY_OPTIONS ship English labels from the
  // shared @levelup/types package, so translate off the stable `value`.
  const typeLabel = t(`training.exerciseType.${type}`);
  const difficultyLabel = t(`training.difficulty.${difficulty}`);

  const toggleLevel = (id: string) => {
    setLevelIds((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    const parsed = exerciseFormSchema.safeParse({
      name,
      description,
      type,
      customType,
      difficulty,
      levelIds,
      notes,
    });
    if (!parsed.success) {
      const raw =
        parsed.error.issues[0]?.message ?? "training.form.invalidExercise";
      setError(t(raw, { defaultValue: raw }));
      return;
    }
    setError(null);
    // An untouched 2v2 board is not worth storing; anything else is sent as v2.
    onSubmit({ ...parsed.data, diagram: isPristineGameDiagram(diagram) ? undefined : diagram });
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      testID="exercise-form"
    >
      <Text className="text-lg font-bold">
        {exercise ? t("training.form.editExercise") : t("training.form.newExercise")}
      </Text>

      <View className="gap-1.5">
        <Label>{t("training.form.nameLabel")}</Label>
        <Input
          testID="exercise-name"
          accessibilityLabel={t("training.form.exerciseNameAria")}
          placeholder={t("training.form.namePlaceholder")}
          value={name}
          onChangeText={setName}
        />
        {error ? (
          <Text className="text-sm text-destructive">{error}</Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Label>{t("training.form.typeLabel")}</Label>
        <Select
          value={{ value: type, label: typeLabel }}
          onValueChange={(option) => {
            if (option) setType(option.value as ExerciseType);
          }}
        >
          <SelectTrigger
            testID="exercise-type-select"
            accessibilityLabel={t("training.form.exerciseTypeAria")}
          >
            <SelectValue placeholder={t("training.form.typeLabel")} />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_TYPE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                label={t(`training.exerciseType.${option.value}`)}
                testID={`exercise-type-${option.value}`}
              />
            ))}
          </SelectContent>
        </Select>
      </View>

      {type === "custom" ? (
        <View className="gap-1.5">
          <Label>{t("training.form.customType")}</Label>
          <Input
            testID="exercise-custom-type"
            accessibilityLabel={t("training.form.customTypeAria")}
            placeholder={t("training.form.customTypePlaceholder")}
            value={customType}
            onChangeText={setCustomType}
          />
        </View>
      ) : null}

      <View className="gap-1.5">
        <Label>{t("training.form.difficultyLabel")}</Label>
        <View className="flex-row gap-2">
          {DIFFICULTY_OPTIONS.map((option) => {
            const active = difficulty === option.value;
            return (
              <Pressable
                key={option.value}
                testID={`exercise-difficulty-${option.value}`}
                accessibilityLabel={t("training.form.difficultyOptionAria", {
                  value: option.value,
                  label: t(`training.difficulty.${option.value}`),
                })}
                role="button"
                onPress={() => setDifficulty(option.value)}
                className={cn(
                  "h-10 flex-1 items-center justify-center rounded-md border",
                  active
                    ? "border-primary bg-primary"
                    : "border-input bg-background"
                )}
              >
                <Text
                  className={cn(
                    "text-base font-semibold",
                    active ? "text-primary-foreground" : "text-foreground"
                  )}
                >
                  {option.value}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-xs text-muted-foreground">
          {difficultyLabel}
        </Text>
      </View>

      <View className="gap-1.5">
        <Label>{t("training.form.description")}</Label>
        <Textarea
          accessibilityLabel={t("training.form.exerciseDescriptionAria")}
          placeholder={t("training.form.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      {levels.length > 0 ? (
        <View className="gap-1.5">
          <Label>{t("training.form.levels")}</Label>
          <View className="gap-1 rounded-md border border-border p-3">
            {levels.map((level) => (
              <Pressable
                key={level.id}
                accessibilityLabel={t("training.form.levelAria", { label: level.label })}
                role="checkbox"
                onPress={() => toggleLevel(level.id)}
                className="flex-row items-center gap-2 py-1.5"
              >
                <Checkbox
                  checked={levelIds.includes(level.id)}
                  onCheckedChange={() => toggleLevel(level.id)}
                />
                <Text className="text-base">
                  {level.code} — {level.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-1.5">
        <Pressable
          testID="exercise-diagram-toggle"
          accessibilityLabel={t("training.form.toggleDiagramAria")}
          role="button"
          onPress={() => setDiagramOpen((v) => !v)}
          className="flex-row items-center justify-between rounded-md border border-input bg-background px-3 py-3"
        >
          <Label className="mb-0">{t("training.diagram.label")}</Label>
          <Ionicons
            name={diagramOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={lightTheme.foreground}
          />
        </Pressable>
        {diagramOpen ? (
          <TacticalBoard value={diagram} onChange={setDiagram} />
        ) : null}
      </View>

      <View className="gap-1.5">
        <Label>{t("training.form.notesLabel")}</Label>
        <Textarea
          accessibilityLabel={t("training.form.exerciseNotesAria")}
          placeholder={t("training.form.notesPlaceholder")}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <View className="gap-2 pt-2">
        <Button
          testID="exercise-save"
          accessibilityLabel={t("training.form.saveExercise")}
          disabled={saving || !name.trim()}
          onPress={handleSave}
        >
          <Text>
            {saving ? t("training.form.saving") : t("training.form.saveExercise")}
          </Text>
        </Button>
        {exercise && onDelete ? (
          <Button
            variant="destructive"
            testID="exercise-delete"
            accessibilityLabel={t("training.card.deleteExercise")}
            disabled={saving}
            onPress={onDelete}
          >
            <Text>{t("training.card.deleteExercise")}</Text>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          accessibilityLabel={t("training.form.cancelAria")}
          onPress={onCancel}
        >
          <Text>{t("common.cancel")}</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
