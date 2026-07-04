import {
  useCoachLevels,
  useCreateExercise,
  useDeleteExercise,
  useExercises,
  useUpdateExercise,
} from "@levelup/hooks";
import type { Exercise, ExercisePayload } from "@levelup/types";
import { DIFFICULTY_OPTIONS, EXERCISE_TYPE_OPTIONS } from "@levelup/types";
import * as React from "react";
import { FlatList, Pressable, View } from "react-native";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ExerciseForm } from "./exercise-form";

function typeLabelOf(exercise: Exercise): string {
  if (exercise.type === "custom" && exercise.customType) {
    return exercise.customType;
  }
  return (
    EXERCISE_TYPE_OPTIONS.find((o) => o.value === exercise.type)?.label ??
    exercise.type
  );
}

function difficultyLabelOf(exercise: Exercise): string {
  const option = DIFFICULTY_OPTIONS.find(
    (o) => o.value === exercise.difficulty
  );
  return option ? `${option.value} · ${option.label}` : String(exercise.difficulty);
}

function ListSkeleton() {
  return (
    <View className="gap-3 py-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </View>
  );
}

/** Exercises tab: list, create/edit form and delete confirmation. */
export function ExercisesTab() {
  const { data: exercises, isLoading, isError, refetch } = useExercises();
  const { data: levels = [] } = useCoachLevels();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Exercise | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const createMut = useCreateExercise({ onSuccess: closeForm });
  const updateMut = useUpdateExercise({ onSuccess: closeForm });
  const deleteMut = useDeleteExercise({
    onSuccess: () => {
      setConfirmingDelete(false);
      closeForm();
    },
  });

  const handleSubmit = (data: ExercisePayload) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  if (formOpen) {
    return (
      <>
        <ExerciseForm
          exercise={editing}
          levels={levels}
          saving={createMut.isPending || updateMut.isPending}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          onDelete={editing ? () => setConfirmingDelete(true) : undefined}
        />
        <AlertDialog
          open={confirmingDelete}
          onOpenChange={(open) => {
            if (!open) setConfirmingDelete(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel accessibilityLabel="Cancel delete exercise">
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                testID="exercise-delete-confirm"
                accessibilityLabel="Confirm delete exercise"
                onPress={() => editing && deleteMut.mutate(editing.id)}
              >
                <Text>Delete</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between py-3">
        <Text className="text-base font-semibold text-muted-foreground">
          {exercises?.length ?? 0} exercises
        </Text>
        <Button
          size="sm"
          testID="exercise-add"
          accessibilityLabel="New exercise"
          onPress={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Text>New exercise</Text>
        </Button>
      </View>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState
          message="Could not load exercises."
          onRetry={() => void refetch()}
        />
      ) : !exercises || exercises.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title="No exercises yet"
          message="Create your first exercise to get started."
        />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 pb-6"
          renderItem={({ item }) => (
            <Pressable
              testID={`exercise-card-${item.id}`}
              accessibilityLabel={`Exercise ${item.name}`}
              role="button"
              onPress={() => {
                setEditing(item);
                setFormOpen(true);
              }}
              className="gap-2 rounded-lg border border-border bg-card p-4 active:bg-accent"
            >
              <Text className="text-base font-semibold">{item.name}</Text>
              {item.description ? (
                <Text
                  numberOfLines={2}
                  className="text-sm text-muted-foreground"
                >
                  {item.description}
                </Text>
              ) : null}
              <View className="flex-row gap-2">
                <Badge variant="secondary">
                  <Text>{typeLabelOf(item)}</Text>
                </Badge>
                <Badge variant="outline">
                  <Text>{difficultyLabelOf(item)}</Text>
                </Badge>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
