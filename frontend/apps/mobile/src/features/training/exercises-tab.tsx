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
import { useTranslation } from "react-i18next";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
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

const ALL_TYPES_VALUE = "all";
const ALL_DIFFICULTIES_VALUE = "all";

/** Exercises tab: list, create/edit form and delete confirmation. */
export function ExercisesTab() {
  const { t } = useTranslation();
  const { data: exercises, isLoading, isError, refetch } = useExercises();
  const { data: levels = [] } = useCoachLevels();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Exercise | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [typeOption, setTypeOption] = React.useState<Option>({
    value: ALL_TYPES_VALUE,
    label: t("training.exercises.allTypes"),
  });
  const [difficultyOption, setDifficultyOption] = React.useState<Option>({
    value: ALL_DIFFICULTIES_VALUE,
    label: t("training.exercises.allDifficulties"),
  });

  // Mirrors web's TrainingExercisesPage filter logic exactly.
  const filtered = React.useMemo(() => {
    const filterType = typeOption?.value ?? ALL_TYPES_VALUE;
    const filterDifficulty = difficultyOption?.value ?? ALL_DIFFICULTIES_VALUE;
    return (exercises ?? []).filter((ex) => {
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filterType !== ALL_TYPES_VALUE && ex.type !== filterType) {
        return false;
      }
      if (
        filterDifficulty !== ALL_DIFFICULTIES_VALUE &&
        ex.difficulty !== Number(filterDifficulty)
      ) {
        return false;
      }
      return true;
    });
  }, [exercises, search, typeOption, difficultyOption]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const createMut = useCreateExercise({
    onSuccess: () => {
      closeForm();
      toast.success(t("training.exercises.toast.created"));
    },
  });
  const updateMut = useUpdateExercise({
    onSuccess: () => {
      closeForm();
      toast.success(t("training.exercises.toast.updated"));
    },
  });
  const deleteMut = useDeleteExercise({
    onSuccess: () => {
      setConfirmingDelete(false);
      closeForm();
      toast.success(t("training.exercises.toast.deleted"));
    },
  });

  const handleSubmit = (data: ExercisePayload) => {
    if (editing) {
      updateMut.mutate(
        { id: editing.id, data },
        {
          onError: () =>
            toast.error(t("training.exercises.toast.updateFailed")),
        }
      );
    } else {
      createMut.mutate(data, {
        onError: () => toast.error(t("training.exercises.toast.createFailed")),
      });
    }
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
              <AlertDialogTitle>
                {t("training.exercises.deleteTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("training.exercises.deleteDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                accessibilityLabel={t("training.exercises.cancelDeleteAria")}
              >
                <Text>{t("common.cancel")}</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                testID="exercise-delete-confirm"
                accessibilityLabel={t("training.exercises.confirmDeleteAria")}
                onPress={() =>
                  editing &&
                  deleteMut.mutate(editing.id, {
                    onError: () =>
                      toast.error(t("training.exercises.toast.deleteFailed")),
                  })
                }
              >
                <Text>{t("common.delete")}</Text>
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
          accessibilityLabel={t("training.exercises.newExercise")}
          onPress={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Text>{t("training.exercises.newExercise")}</Text>
        </Button>
      </View>

      {!isLoading && !isError && exercises && exercises.length > 0 ? (
        <View className="gap-2 pb-3">
          <Input
            testID="exercises-search"
            accessibilityLabel={t("training.exercises.searchAria")}
            placeholder={t("training.exercises.searchPlaceholder")}
            value={search}
            onChangeText={setSearch}
          />
          <View className="flex-row gap-2">
            <Select
              value={typeOption}
              onValueChange={setTypeOption}
              className="flex-1"
            >
              <SelectTrigger
                testID="exercises-filter-type"
                accessibilityLabel={t("training.exercises.filterByTypeAria")}
              >
                <SelectValue placeholder={t("training.exercises.typePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value={ALL_TYPES_VALUE}
                  label={t("training.exercises.allTypes")}
                />
                {EXERCISE_TYPE_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    label={t(`training.exerciseType.${o.value}`)}
                  />
                ))}
              </SelectContent>
            </Select>
            <Select
              value={difficultyOption}
              onValueChange={setDifficultyOption}
              className="flex-1"
            >
              <SelectTrigger
                testID="exercises-filter-difficulty"
                accessibilityLabel={t("training.exercises.filterByDifficultyAria")}
              >
                <SelectValue
                  placeholder={t("training.exercises.difficultyPlaceholder")}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value={ALL_DIFFICULTIES_VALUE}
                  label={t("training.exercises.allDifficulties")}
                />
                {DIFFICULTY_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={String(o.value)}
                    label={t(`training.difficulty.${o.value}`)}
                  />
                ))}
              </SelectContent>
            </Select>
          </View>
        </View>
      ) : null}

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState
          message={t("training.exercises.couldNotLoad")}
          onRetry={() => void refetch()}
        />
      ) : !exercises || exercises.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title={t("training.exercises.emptyTitle")}
          message={t("training.exercises.emptyMessage")}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="barbell-outline"
          title={t("training.exercises.noResultsTitle")}
          message={t("training.exercises.noResultsDescription")}
        />
      ) : (
        <FlatList
          data={filtered}
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
