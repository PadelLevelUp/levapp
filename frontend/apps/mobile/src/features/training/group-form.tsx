import type {
  Exercise,
  ExerciseGroup,
  ExerciseGroupPayload,
} from "@levelup/types";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";

type GroupFormProps = {
  /** When set, the form edits this group; otherwise it creates a new one. */
  group: ExerciseGroup | null;
  exercises: Exercise[];
  saving: boolean;
  onSubmit: (payload: ExerciseGroupPayload) => void;
  onCancel: () => void;
  /** Only offered while editing; parent shows the confirm dialog. */
  onDelete?: () => void;
};

/** Exercise-group create/edit form (name, description, exercise picker). */
export function GroupForm({
  group,
  exercises,
  saving,
  onSubmit,
  onCancel,
  onDelete,
}: GroupFormProps) {
  const [name, setName] = React.useState(group?.name ?? "");
  const [description, setDescription] = React.useState(
    group?.description ?? ""
  );
  const [exerciseIds, setExerciseIds] = React.useState<string[]>(
    group?.exerciseIds ?? []
  );

  const toggleExercise = (id: string) => {
    setExerciseIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, description, exerciseIds });
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 p-4 pb-10"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      testID="group-form"
    >
      <Text className="text-lg font-bold">
        {group ? "Edit group" : "New group"}
      </Text>

      <View className="gap-1.5">
        <Label>Name</Label>
        <Input
          testID="group-name"
          accessibilityLabel="Group name"
          placeholder="e.g. Monday warm-up"
          value={name}
          onChangeText={setName}
        />
      </View>

      <View className="gap-1.5">
        <Label>Description</Label>
        <Textarea
          accessibilityLabel="Group description"
          placeholder="What is this group for?"
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <View className="gap-1.5">
        <Label>Exercises ({exerciseIds.length} selected)</Label>
        {exercises.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            No exercises yet — create exercises first.
          </Text>
        ) : (
          <View className="gap-1 rounded-md border border-border p-3">
            {exercises.map((exercise) => (
              <Pressable
                key={exercise.id}
                testID={`group-exercise-${exercise.id}`}
                accessibilityLabel={`Include exercise ${exercise.name}`}
                role="checkbox"
                onPress={() => toggleExercise(exercise.id)}
                className="flex-row items-center gap-2 py-1.5"
              >
                <Checkbox
                  checked={exerciseIds.includes(exercise.id)}
                  onCheckedChange={() => toggleExercise(exercise.id)}
                />
                <Text numberOfLines={1} className="flex-1 text-base">
                  {exercise.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View className="gap-2 pt-2">
        <Button
          testID="group-save"
          accessibilityLabel="Save group"
          disabled={saving || !name.trim()}
          onPress={handleSave}
        >
          <Text>{saving ? "Saving…" : "Save group"}</Text>
        </Button>
        {group && onDelete ? (
          <Button
            variant="destructive"
            testID="group-delete"
            accessibilityLabel="Delete group"
            disabled={saving}
            onPress={onDelete}
          >
            <Text>Delete group</Text>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          accessibilityLabel="Cancel group form"
          onPress={onCancel}
        >
          <Text>Cancel</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
