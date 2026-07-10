import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { CoachLevel } from "@levelup/types";
import type {
  CourtDiagram,
  Difficulty,
  Exercise,
  ExercisePayload,
  ExerciseType,
} from "@levelup/types";
import { DIFFICULTY_OPTIONS, EXERCISE_TYPE_OPTIONS } from "@levelup/types";
import { exerciseFormSchema } from "@levelup/validation";
import * as React from "react";
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
import { CourtDiagramEditor } from "@/features/training/court-diagram-editor";
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
 * form compact) hosting the touch port of web's CourtDiagramEditor.
 */
export function ExerciseForm({
  exercise,
  levels,
  saving,
  onSubmit,
  onCancel,
  onDelete,
}: ExerciseFormProps) {
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
  const [diagram, setDiagram] = React.useState<CourtDiagram>(
    exercise?.diagram ?? { elements: [] }
  );
  const [diagramOpen, setDiagramOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const typeLabel =
    EXERCISE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
  const difficultyLabel =
    DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)?.label ?? "";

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
      setError(parsed.error.issues[0]?.message ?? "Invalid exercise");
      return;
    }
    setError(null);
    onSubmit({ ...parsed.data, diagram });
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
        {exercise ? "Edit exercise" : "New exercise"}
      </Text>

      <View className="gap-1.5">
        <Label>Name</Label>
        <Input
          testID="exercise-name"
          accessibilityLabel="Exercise name"
          placeholder="e.g. Cross-court volleys"
          value={name}
          onChangeText={setName}
        />
        {error ? (
          <Text className="text-sm text-destructive">{error}</Text>
        ) : null}
      </View>

      <View className="gap-1.5">
        <Label>Type</Label>
        <Select
          value={{ value: type, label: typeLabel }}
          onValueChange={(option) => {
            if (option) setType(option.value as ExerciseType);
          }}
        >
          <SelectTrigger
            testID="exercise-type-select"
            accessibilityLabel="Exercise type"
          >
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {EXERCISE_TYPE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                label={option.label}
                testID={`exercise-type-${option.value}`}
              />
            ))}
          </SelectContent>
        </Select>
      </View>

      {type === "custom" ? (
        <View className="gap-1.5">
          <Label>Custom type</Label>
          <Input
            testID="exercise-custom-type"
            accessibilityLabel="Custom exercise type"
            placeholder="e.g. Bandeja"
            value={customType}
            onChangeText={setCustomType}
          />
        </View>
      ) : null}

      <View className="gap-1.5">
        <Label>Difficulty</Label>
        <View className="flex-row gap-2">
          {DIFFICULTY_OPTIONS.map((option) => {
            const active = difficulty === option.value;
            return (
              <Pressable
                key={option.value}
                testID={`exercise-difficulty-${option.value}`}
                accessibilityLabel={`Difficulty ${option.value} (${option.label})`}
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
        <Label>Description</Label>
        <Textarea
          accessibilityLabel="Exercise description"
          placeholder="Describe the drill…"
          value={description}
          onChangeText={setDescription}
        />
      </View>

      {levels.length > 0 ? (
        <View className="gap-1.5">
          <Label>Levels</Label>
          <View className="gap-1 rounded-md border border-border p-3">
            {levels.map((level) => (
              <Pressable
                key={level.id}
                accessibilityLabel={`Level ${level.label}`}
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
          accessibilityLabel="Toggle court diagram"
          role="button"
          onPress={() => setDiagramOpen((v) => !v)}
          className="flex-row items-center justify-between rounded-md border border-input bg-background px-3 py-3"
        >
          <Label className="mb-0">Court diagram</Label>
          <Ionicons
            name={diagramOpen ? "chevron-up" : "chevron-down"}
            size={18}
            color={lightTheme.foreground}
          />
        </Pressable>
        {diagramOpen ? (
          <CourtDiagramEditor value={diagram} onChange={setDiagram} />
        ) : null}
      </View>

      <View className="gap-1.5">
        <Label>Notes</Label>
        <Textarea
          accessibilityLabel="Exercise notes"
          placeholder="Coaching notes…"
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <View className="gap-2 pt-2">
        <Button
          testID="exercise-save"
          accessibilityLabel="Save exercise"
          disabled={saving || !name.trim()}
          onPress={handleSave}
        >
          <Text>{saving ? "Saving…" : "Save exercise"}</Text>
        </Button>
        {exercise && onDelete ? (
          <Button
            variant="destructive"
            testID="exercise-delete"
            accessibilityLabel="Delete exercise"
            disabled={saving}
            onPress={onDelete}
          >
            <Text>Delete exercise</Text>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          accessibilityLabel="Cancel exercise form"
          onPress={onCancel}
        >
          <Text>Cancel</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
