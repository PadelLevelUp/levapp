import type {
  Exercise,
  ExerciseGroup,
  ExerciseGroupPayload,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        {group ? t("training.groupForm.editGroup") : t("training.groupForm.newGroup")}
      </Text>

      <View className="gap-1.5">
        <Label>{t("training.groupForm.nameLabel")}</Label>
        <Input
          testID="group-name"
          accessibilityLabel={t("training.groupForm.groupNameAria")}
          placeholder={t("training.groupForm.namePlaceholder")}
          value={name}
          onChangeText={setName}
        />
      </View>

      <View className="gap-1.5">
        <Label>{t("training.groupForm.description")}</Label>
        <Textarea
          accessibilityLabel={t("training.groupForm.groupDescriptionAria")}
          placeholder={t("training.groupForm.descriptionPlaceholder")}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <View className="gap-1.5">
        <Label>
          {t("training.groupForm.exercisesWithCount", {
            count: exerciseIds.length,
          })}
        </Label>
        {exercises.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            {t("training.groupForm.noExercisesYet")}
          </Text>
        ) : (
          <View className="gap-1 rounded-md border border-border p-3">
            {exercises.map((exercise) => (
              <Pressable
                key={exercise.id}
                testID={`group-exercise-${exercise.id}`}
                accessibilityLabel={t("training.groupForm.includeExerciseAria", {
                  name: exercise.name,
                })}
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
          accessibilityLabel={t("training.groupForm.saveGroup")}
          disabled={saving || !name.trim()}
          onPress={handleSave}
        >
          <Text>
            {saving
              ? t("training.groupForm.saving")
              : t("training.groupForm.saveGroup")}
          </Text>
        </Button>
        {group && onDelete ? (
          <Button
            variant="destructive"
            testID="group-delete"
            accessibilityLabel={t("training.groupForm.deleteGroup")}
            disabled={saving}
            onPress={onDelete}
          >
            <Text>{t("training.groupForm.deleteGroup")}</Text>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          accessibilityLabel={t("training.groupForm.cancelAria")}
          onPress={onCancel}
        >
          <Text>{t("common.cancel")}</Text>
        </Button>
      </View>
    </ScrollView>
  );
}
