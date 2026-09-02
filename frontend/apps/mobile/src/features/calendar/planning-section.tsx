import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useExerciseGroups, useExercises } from "@levelup/hooks";
import {
  DIFFICULTY_OPTIONS,
  EXERCISE_TYPE_OPTIONS,
  type Exercise,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";

function typeLabel(type: Exercise["type"]): string {
  return EXERCISE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
function difficultyLabel(difficulty: Exercise["difficulty"]): string {
  return (
    DIFFICULTY_OPTIONS.find((o) => o.value === difficulty)?.label ??
    String(difficulty)
  );
}

interface PlanningSectionProps {
  exerciseIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  isEditing: boolean;
  onEditStart: () => void;
}

/** Ports web's ClassPlanningSection.tsx: shows the planned exercise list
 * (read-only) with an Edit trigger; in edit mode, exercises can be removed
 * from the list or added via a picker dialog (Exercises / Groups tabs). */
export function PlanningSection({
  exerciseIds,
  onChange,
  disabled,
  isEditing,
  onEditStart,
}: PlanningSectionProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [pickerTab, setPickerTab] = React.useState<"exercises" | "groups">(
    "exercises"
  );

  const { data: allExercises = [] } = useExercises();
  const { data: groups = [] } = useExerciseGroups();

  const planned = exerciseIds
    .map((id) => allExercises.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => !!exercise);

  const removeExercise = (id: string) => {
    onChange(exerciseIds.filter((exerciseId) => exerciseId !== id));
  };

  const addExercise = (id: string) => {
    if (!exerciseIds.includes(id)) onChange([...exerciseIds, id]);
  };

  const addGroup = (groupExerciseIds: string[]) => {
    const newIds = groupExerciseIds.filter((id) => !exerciseIds.includes(id));
    if (newIds.length > 0) onChange([...exerciseIds, ...newIds]);
  };

  const filteredExercises = allExercises.filter(
    (exercise) =>
      !exerciseIds.includes(exercise.id) &&
      exercise.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="barbell-outline"
            size={16}
            color={lightTheme.foreground}
          />
          <Text className="text-sm font-medium">
            {t("calendar.planning.title", { count: planned.length })}
          </Text>
        </View>
        {!disabled && isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            testID="class-planning-add"
            accessibilityLabel="Add exercises"
            onPress={() => {
              setSearch("");
              setPickerOpen(true);
            }}
          >
            <Ionicons name="add" size={14} color={lightTheme.primary} />
            <Text className="text-xs">{t("calendar.planning.add")}</Text>
          </Button>
        ) : null}
        {!disabled && !isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            testID="class-planning-edit"
            accessibilityLabel="Edit training plan"
            onPress={onEditStart}
          >
            <Ionicons
              name="pencil-outline"
              size={14}
              color={lightTheme.primary}
            />
            <Text className="text-xs">{t("calendar.planning.edit")}</Text>
          </Button>
        ) : null}
      </View>

      {planned.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          {t("calendar.planning.noExercisesPlanned")}
        </Text>
      ) : (
        <View className="gap-1.5">
          {planned.map((exercise) => (
            <View
              key={exercise.id}
              className="flex-row items-center justify-between gap-2 rounded-lg bg-muted/50 p-2"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium" numberOfLines={1}>
                  {exercise.name}
                </Text>
                <View className="mt-0.5 flex-row gap-1.5">
                  <Badge variant="secondary">
                    <Text className="text-[10px]">
                      {typeLabel(exercise.type)}
                    </Text>
                  </Badge>
                  <Badge variant="outline">
                    <Text className="text-[10px]">
                      {difficultyLabel(exercise.difficulty)}
                    </Text>
                  </Badge>
                </View>
              </View>
              {isEditing ? (
                <Pressable
                  testID={`class-planning-remove-${exercise.id}`}
                  accessibilityLabel={`Remove ${exercise.name}`}
                  role="button"
                  hitSlop={8}
                  onPress={() => removeExercise(exercise.id)}
                  className="h-7 w-7 items-center justify-center rounded-md active:bg-accent"
                >
                  <Ionicons
                    name="close"
                    size={16}
                    color={lightTheme.destructive}
                  />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent testID="class-planning-picker">
          <DialogHeader>
            <DialogTitle>{t("calendar.planning.addExercises")}</DialogTitle>
          </DialogHeader>

          <Input
            testID="class-planning-search"
            accessibilityLabel="Search exercises"
            placeholder={t("calendar.planning.searchPlaceholder")}
            value={search}
            onChangeText={setSearch}
          />

          <Tabs
            value={pickerTab}
            onValueChange={(value) =>
              setPickerTab(value as "exercises" | "groups")
            }
          >
            <TabsList>
              <TabsTrigger value="exercises">
                <Text>{t("calendar.planning.exercises")}</Text>
              </TabsTrigger>
              <TabsTrigger value="groups">
                <Text>{t("calendar.planning.groups")}</Text>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="exercises">
              <ScrollView className="max-h-72">
                {filteredExercises.length === 0 ? (
                  <Text className="py-8 text-center text-sm text-muted-foreground">
                    {search
                      ? t("calendar.planning.noExercisesFound")
                      : t("calendar.planning.allExercisesAdded")}
                  </Text>
                ) : (
                  <View className="gap-1">
                    {filteredExercises.map((exercise) => (
                      <Pressable
                        key={exercise.id}
                        testID={`class-planning-exercise-${exercise.id}`}
                        accessibilityLabel={`Add ${exercise.name}`}
                        role="button"
                        onPress={() => addExercise(exercise.id)}
                        className="flex-row items-center justify-between gap-2 rounded-lg p-2.5 active:bg-accent"
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-sm font-medium" numberOfLines={1}>
                            {exercise.name}
                          </Text>
                          <View className="mt-0.5 flex-row gap-1.5">
                            <Badge variant="secondary">
                              <Text className="text-[10px]">
                                {typeLabel(exercise.type)}
                              </Text>
                            </Badge>
                            <Badge variant="outline">
                              <Text className="text-[10px]">
                                {difficultyLabel(exercise.difficulty)}
                              </Text>
                            </Badge>
                          </View>
                        </View>
                        <Ionicons
                          name="add"
                          size={18}
                          color={lightTheme.mutedForeground}
                        />
                      </Pressable>
                    ))}
                  </View>
                )}
              </ScrollView>
            </TabsContent>

            <TabsContent value="groups">
              <ScrollView className="max-h-72">
                {filteredGroups.length === 0 ? (
                  <Text className="py-8 text-center text-sm text-muted-foreground">
                    {t("calendar.planning.noGroupsFound")}
                  </Text>
                ) : (
                  <View className="gap-1">
                    {filteredGroups.map((group) => {
                      const groupExercises = allExercises.filter((exercise) =>
                        group.exerciseIds.includes(exercise.id)
                      );
                      const newCount = group.exerciseIds.filter(
                        (id) => !exerciseIds.includes(id)
                      ).length;
                      return (
                        <Pressable
                          key={group.id}
                          testID={`class-planning-group-${group.id}`}
                          accessibilityLabel={`Add group ${group.name}`}
                          role="button"
                          disabled={newCount === 0}
                          onPress={() => addGroup(group.exerciseIds)}
                          className={
                            newCount === 0
                              ? "flex-row items-center justify-between gap-2 rounded-lg p-2.5 opacity-50"
                              : "flex-row items-center justify-between gap-2 rounded-lg p-2.5 active:bg-accent"
                          }
                        >
                          <View className="min-w-0 flex-1">
                            <Text
                              className="text-sm font-medium"
                              numberOfLines={1}
                            >
                              {group.name}
                            </Text>
                            <Text className="mt-0.5 text-xs text-muted-foreground">
                              {t("calendar.planning.exerciseCount", {
                                count: groupExercises.length,
                              })}
                              {newCount === 0
                                ? t("calendar.planning.allAlreadyAdded")
                                : ""}
                            </Text>
                          </View>
                          {newCount > 0 ? (
                            <View className="flex-row items-center gap-1">
                              <Text className="text-xs text-muted-foreground">
                                +{newCount}
                              </Text>
                              <Ionicons
                                name="add"
                                size={18}
                                color={lightTheme.mutedForeground}
                              />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </View>
  );
}
