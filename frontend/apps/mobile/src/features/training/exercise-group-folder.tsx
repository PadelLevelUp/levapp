import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { Exercise, ExerciseGroup } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface ExerciseGroupFolderProps {
  group: ExerciseGroup;
  exercises: Exercise[];
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (id: string) => void;
}

/**
 * Expandable group card, mirroring web's ExerciseGroupFolder.tsx: a header
 * row (chevron + folder icon + name/count, edit/delete icons) that toggles
 * an inline list of the group's member exercises, each with its own
 * edit/delete affordance.
 *
 * Edit/delete for a member exercise are lifted to the parent (groups-tab.tsx)
 * exactly like web lifts them to TrainingGroupsPage — this component never
 * touches exercise-form.tsx or the exercise mutations itself.
 */
export function ExerciseGroupFolder({
  group,
  exercises,
  onEditGroup,
  onDeleteGroup,
  onEditExercise,
  onDeleteExercise,
}: ExerciseGroupFolderProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  const groupExercises = exercises.filter((ex) =>
    group.exerciseIds.includes(ex.id)
  );

  return (
    <View className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Toggle and the edit/delete icons are SIBLINGS, not nested — a
          Pressable wrapping other Pressables collapses the whole subtree
          into one accessible element on iOS, hiding the inner buttons from
          both VoiceOver and UI-testing tools (found via Maestro: the edit
          icon was visually present but unreachable by accessibilityLabel
          while nested inside the toggle Pressable). */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          testID={`group-folder-toggle-${group.id}`}
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} group ${group.name}`}
          role="button"
          onPress={() => setExpanded((prev) => !prev)}
          className="flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          <Ionicons
            name="chevron-forward"
            size={16}
            color={lightTheme.mutedForeground}
            style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
          />
          <Ionicons
            name={expanded ? "folder-open-outline" : "folder-outline"}
            size={20}
            color={lightTheme.primary}
          />
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-semibold text-sm" numberOfLines={1}>
                {group.name}
              </Text>
              <Badge variant="secondary">
                <Text className="text-[10px]">
                  {t("training.folder.exerciseCount", {
                    count: groupExercises.length,
                  })}
                </Text>
              </Badge>
            </View>
            {group.description ? (
              <Text
                numberOfLines={1}
                className="mt-0.5 text-xs text-muted-foreground"
              >
                {group.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityLabel={`Edit group ${group.name}`}
            role="button"
            hitSlop={8}
            onPress={onEditGroup}
            className="h-9 w-9 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons
              name="pencil-outline"
              size={16}
              color={lightTheme.mutedForeground}
            />
          </Pressable>
          <Pressable
            accessibilityLabel={`Delete group ${group.name}`}
            role="button"
            hitSlop={8}
            onPress={onDeleteGroup}
            className="h-9 w-9 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons
              name="trash-outline"
              size={16}
              color={lightTheme.destructive}
            />
          </Pressable>
        </View>
      </View>

      {expanded ? (
        <View className="gap-2 px-4 pb-4 pt-1">
          {groupExercises.length === 0 ? (
            <Text className="py-2 text-sm text-muted-foreground">
              {t("training.folder.emptyGroup")}
            </Text>
          ) : (
            groupExercises.map((ex) => (
              <View
                key={ex.id}
                className={cn(
                  "flex-row items-center gap-2 rounded-md border border-border bg-background p-2.5"
                )}
              >
                <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
                  {ex.name}
                </Text>
                <Pressable
                  testID={`group-exercise-edit-${ex.id}`}
                  accessibilityLabel={`Edit exercise ${ex.name}`}
                  role="button"
                  hitSlop={8}
                  onPress={() => onEditExercise(ex)}
                  className="h-8 w-8 items-center justify-center rounded-md active:bg-accent"
                >
                  <Ionicons
                    name="pencil-outline"
                    size={14}
                    color={lightTheme.mutedForeground}
                  />
                </Pressable>
                <Pressable
                  testID={`group-exercise-delete-${ex.id}`}
                  accessibilityLabel={`Delete exercise ${ex.name}`}
                  role="button"
                  hitSlop={8}
                  onPress={() => onDeleteExercise(ex.id)}
                  className="h-8 w-8 items-center justify-center rounded-md active:bg-accent"
                >
                  <Ionicons
                    name="trash-outline"
                    size={14}
                    color={lightTheme.destructive}
                  />
                </Pressable>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
