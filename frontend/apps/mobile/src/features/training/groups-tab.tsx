import {
  useCoachLevels,
  useCreateExerciseGroup,
  useDeleteExercise,
  useDeleteExerciseGroup,
  useExerciseGroups,
  useExercises,
  useUpdateExercise,
  useUpdateExerciseGroup,
} from "@levelup/hooks";
import type {
  Exercise,
  ExerciseGroup,
  ExerciseGroupPayload,
  ExercisePayload,
} from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { ExerciseForm } from "./exercise-form";
import { ExerciseGroupFolder } from "./exercise-group-folder";
import { GroupForm } from "./group-form";

function ListSkeleton() {
  return (
    <View className="gap-3 py-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </View>
  );
}

/** Groups tab: list (with inline group-folder browsing), create/edit form
 * and delete confirmation — plus, lifted from the folder, editing/deleting a
 * member exercise via the same ExerciseForm exercises-tab.tsx uses. */
export function GroupsTab() {
  const { t } = useTranslation();
  const { data: groups, isLoading, isError, refetch } = useExerciseGroups();
  const { data: exercises = [] } = useExercises();
  const { data: levels = [] } = useCoachLevels();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExerciseGroup | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  // Inline exercise editing/deleting from within a group folder — same
  // ExerciseForm + mutations exercises-tab.tsx uses, just opened from here.
  const [exerciseFormOpen, setExerciseFormOpen] = React.useState(false);
  const [editingExercise, setEditingExercise] = React.useState<Exercise | null>(
    null
  );
  const [confirmingDeleteExercise, setConfirmingDeleteExercise] =
    React.useState(false);

  const [search, setSearch] = React.useState("");

  // Mirrors web's TrainingGroupsPage: matches on the group's own name OR any
  // member exercise's name.
  const filtered = React.useMemo(() => {
    if (!search) return groups ?? [];
    const q = search.toLowerCase();
    return (groups ?? []).filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      return g.exerciseIds.some((id) => {
        const ex = exercises.find((e) => e.id === id);
        return !!ex && ex.name.toLowerCase().includes(q);
      });
    });
  }, [groups, exercises, search]);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const createMut = useCreateExerciseGroup({
    onSuccess: () => {
      closeForm();
      toast.success(t("training.groups.toast.created"));
    },
  });
  const updateMut = useUpdateExerciseGroup({
    onSuccess: () => {
      closeForm();
      toast.success(t("training.groups.toast.updated"));
    },
  });
  const deleteMut = useDeleteExerciseGroup({
    onSuccess: () => {
      setConfirmingDelete(false);
      closeForm();
      toast.success(t("training.groups.toast.deleted"));
    },
  });

  const handleSubmit = (data: ExerciseGroupPayload) => {
    if (editing) {
      updateMut.mutate(
        { id: editing.id, data },
        { onError: () => toast.error(t("training.groups.toast.updateFailed")) }
      );
    } else {
      createMut.mutate(data, {
        onError: () => toast.error(t("training.groups.toast.createFailed")),
      });
    }
  };

  // ── Inline exercise editing/deleting from within a group folder ──
  const closeExerciseForm = () => {
    setExerciseFormOpen(false);
    setEditingExercise(null);
  };

  const updateExerciseMut = useUpdateExercise({
    onSuccess: () => {
      closeExerciseForm();
      toast.success(t("training.exercises.toast.updated"));
    },
  });
  const deleteExerciseMut = useDeleteExercise({
    onSuccess: () => {
      setConfirmingDeleteExercise(false);
      closeExerciseForm();
      toast.success(t("training.exercises.toast.deleted"));
    },
  });

  const handleExerciseSubmit = (data: ExercisePayload) => {
    if (!editingExercise) return;
    updateExerciseMut.mutate(
      { id: editingExercise.id, data },
      { onError: () => toast.error(t("training.exercises.toast.updateFailed")) }
    );
  };

  return (
    <>
      {exerciseFormOpen ? (
        <ExerciseForm
          exercise={editingExercise}
          levels={levels}
          saving={updateExerciseMut.isPending}
          onSubmit={handleExerciseSubmit}
          onCancel={closeExerciseForm}
          onDelete={() => setConfirmingDeleteExercise(true)}
        />
      ) : formOpen ? (
        <GroupForm
          group={editing}
          exercises={exercises}
          saving={createMut.isPending || updateMut.isPending}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          onDelete={editing ? () => setConfirmingDelete(true) : undefined}
        />
      ) : (
        <View className="flex-1">
          <View className="flex-row items-center justify-between py-3">
            <Text className="text-base font-semibold text-muted-foreground">
              {groups?.length ?? 0} groups
            </Text>
            <Button
              size="sm"
              testID="group-add"
              accessibilityLabel={t("training.groups.newGroup")}
              onPress={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Text>{t("training.groups.newGroup")}</Text>
            </Button>
          </View>

          {!isLoading && !isError && groups && groups.length > 0 ? (
            <View className="pb-3">
              <Input
                testID="groups-search"
                accessibilityLabel={t("training.groups.searchAria")}
                placeholder={t("training.groups.searchPlaceholder")}
                value={search}
                onChangeText={setSearch}
              />
            </View>
          ) : null}

          {isLoading ? (
            <ListSkeleton />
          ) : isError ? (
            <ErrorState
              message={t("training.groups.couldNotLoad")}
              onRetry={() => void refetch()}
            />
          ) : !groups || groups.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title={t("training.groups.emptyTitle")}
              message={t("training.groups.emptyMessage")}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="folder-open-outline"
              title={t("training.groups.noResultsTitle")}
              message={t("training.groups.noResultsDescription")}
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerClassName="gap-3 pb-6"
              renderItem={({ item }) => (
                <ExerciseGroupFolder
                  group={item}
                  exercises={exercises}
                  onEditGroup={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                  onDeleteGroup={() => {
                    setEditing(item);
                    setConfirmingDelete(true);
                  }}
                  onEditExercise={(ex) => {
                    setEditingExercise(ex);
                    setExerciseFormOpen(true);
                  }}
                  onDeleteExercise={(id) => {
                    const ex = exercises.find((e) => e.id === id);
                    if (ex) {
                      setEditingExercise(ex);
                      setConfirmingDeleteExercise(true);
                    }
                  }}
                />
              )}
            />
          )}
        </View>
      )}

      {/* Group delete confirm — reachable from a folder's trash icon (list
          view) or from GroupForm's own delete action (form view). */}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("training.groups.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("training.groups.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              accessibilityLabel={t("training.groups.cancelDeleteGroupAria")}
            >
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="group-delete-confirm"
              accessibilityLabel={t("training.groups.confirmDeleteGroupAria")}
              onPress={() =>
                editing &&
                deleteMut.mutate(editing.id, {
                  onError: () =>
                    toast.error(t("training.groups.toast.deleteFailed")),
                })
              }
            >
              <Text>{t("common.delete")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exercise delete confirm — reachable from a folder's trash icon
          (list view) or from ExerciseForm's own delete action. */}
      <AlertDialog
        open={confirmingDeleteExercise}
        onOpenChange={(open) => {
          if (!open) setConfirmingDeleteExercise(false);
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
              testID="group-exercise-delete-confirm"
              accessibilityLabel={t("training.exercises.confirmDeleteAria")}
              onPress={() =>
                editingExercise &&
                deleteExerciseMut.mutate(editingExercise.id, {
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
