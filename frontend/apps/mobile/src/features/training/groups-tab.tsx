import {
  useCreateExerciseGroup,
  useDeleteExerciseGroup,
  useExerciseGroups,
  useExercises,
  useUpdateExerciseGroup,
} from "@levelup/hooks";
import type { ExerciseGroup, ExerciseGroupPayload } from "@levelup/types";
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

/** Groups tab: list, create/edit form and delete confirmation. */
export function GroupsTab() {
  const { data: groups, isLoading, isError, refetch } = useExerciseGroups();
  const { data: exercises = [] } = useExercises();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExerciseGroup | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const createMut = useCreateExerciseGroup({ onSuccess: closeForm });
  const updateMut = useUpdateExerciseGroup({ onSuccess: closeForm });
  const deleteMut = useDeleteExerciseGroup({
    onSuccess: () => {
      setConfirmingDelete(false);
      closeForm();
    },
  });

  const handleSubmit = (data: ExerciseGroupPayload) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  if (formOpen) {
    return (
      <>
        <GroupForm
          group={editing}
          exercises={exercises}
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
              <AlertDialogTitle>Delete group?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the group but keep the exercises.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel accessibilityLabel="Cancel delete group">
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                testID="group-delete-confirm"
                accessibilityLabel="Confirm delete group"
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
          {groups?.length ?? 0} groups
        </Text>
        <Button
          size="sm"
          testID="group-add"
          accessibilityLabel="New group"
          onPress={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Text>New group</Text>
        </Button>
      </View>

      {isLoading ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState
          message="Could not load groups."
          onRetry={() => void refetch()}
        />
      ) : !groups || groups.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title="No groups yet"
          message="Create your first group to organize exercises."
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-3 pb-6"
          renderItem={({ item }) => (
            <Pressable
              testID={`group-card-${item.id}`}
              accessibilityLabel={`Group ${item.name}`}
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
              <Badge variant="outline">
                <Text>
                  {item.exerciseIds.length}{" "}
                  {item.exerciseIds.length === 1 ? "exercise" : "exercises"}
                </Text>
              </Badge>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
