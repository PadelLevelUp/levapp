import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { AvailabilityBlocker } from "@levelup/api/src/resources/availability";
import { useAvailabilityBlockers } from "@levelup/hooks";
import { useRouter } from "expo-router";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
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
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  BlockerForm,
  blockerTypeLabel,
  type BlockerPayload,
} from "@/features/availability/BlockerForm";
import {
  useCreateBlocker,
  useDeleteBlocker,
  useUpdateBlocker,
} from "@/features/availability/hooks";

const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function describeBlocker(b: AvailabilityBlocker): string {
  const time = `${b.startTime ?? ""}–${b.endTime ?? ""}`;
  if (b.isRecurring && b.recurrenceRule) {
    const days = (b.recurrenceRule.daysOfWeek ?? [])
      .map((d) => DAY_LABELS[d])
      .filter(Boolean)
      .join(", ");
    return `Every ${days || "week"} · ${time}`;
  }
  return `${b.date ?? ""} · ${time}`;
}

export default function AvailabilityScreen() {
  const router = useRouter();
  const { data: blockers, isPending, isError, refetch } =
    useAvailabilityBlockers();
  const createBlocker = useCreateBlocker();
  const updateBlocker = useUpdateBlocker();
  const deleteBlocker = useDeleteBlocker();

  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<AvailabilityBlocker | null>(
    null
  );
  const [pendingDelete, setPendingDelete] =
    React.useState<AvailabilityBlocker | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const saving = createBlocker.isPending || updateBlocker.isPending;

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
    setError(null);
  };

  const openEdit = (blocker: AvailabilityBlocker) => {
    setEditing(blocker);
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (payload: BlockerPayload) => {
    setError(null);
    try {
      if (editing) {
        await updateBlocker.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createBlocker.mutateAsync(payload);
      }
      setShowForm(false);
      setEditing(null);
    } catch {
      setError("Could not save blocker. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setError(null);
    try {
      await deleteBlocker.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      setPendingDelete(null);
      setError("Could not remove blocker. Please try again.");
    }
  };

  const body = () => {
    if (isPending) {
      return (
        <View className="gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </View>
      );
    }
    if (isError) {
      return (
        <ErrorState
          message="Could not load your blockers."
          onRetry={() => refetch()}
        />
      );
    }
    const items = blockers ?? [];
    if (items.length === 0 && !showForm) {
      return (
        <EmptyState
          icon="calendar-outline"
          title="No blockers yet"
          message="Add one to stop auto-invitations when you're unavailable."
        />
      );
    }
    return (
      <View className="gap-3">
        {items.map((b) => (
          <View
            key={b.id}
            testID={`blocker-card-${b.id}`}
            className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3"
          >
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-medium" numberOfLines={1}>
                  {b.title || "Unavailable"}
                </Text>
                {b.isRecurring ? (
                  <Badge variant="secondary">
                    <Text>Recurring</Text>
                  </Badge>
                ) : null}
                <Badge variant="outline">
                  <Text>{blockerTypeLabel(b.type)}</Text>
                </Badge>
              </View>
              <Text className="text-sm text-muted-foreground">
                {describeBlocker(b)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Won't receive auto-invitations during this time.
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Pressable
                accessibilityLabel="Edit blocker"
                role="button"
                hitSlop={8}
                onPress={() => openEdit(b)}
                className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
              >
                <Ionicons
                  name="pencil-outline"
                  size={18}
                  color={lightTheme.mutedForeground}
                />
              </Pressable>
              <Pressable
                testID={`blocker-delete-${b.id}`}
                accessibilityLabel="Delete blocker"
                role="button"
                hitSlop={8}
                onPress={() => setPendingDelete(b)}
                className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
              >
                <Ionicons
                  name="trash-outline"
                  size={18}
                  color={lightTheme.destructive}
                />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Screen edges={["top"]} testID="screen-availability">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={lightTheme.foreground}
          />
        </Button>
        <Text
          role="heading"
          aria-level={1}
          className="flex-1 text-xl font-bold"
        >
          Availability
        </Text>
        {!showForm ? (
          <Button
            size="sm"
            testID="availability-add"
            accessibilityLabel="Add blocker"
            onPress={openCreate}
          >
            <Text>Add blocker</Text>
          </Button>
        ) : null}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        <Text className="text-sm text-muted-foreground">
          Set blockers for times you're unavailable. You won't receive
          automatic class invitations during a blocker. Your coach can still
          add you to a class manually.
        </Text>

        {showForm ? (
          <BlockerForm
            key={editing?.id ?? "new"}
            initial={editing}
            saving={saving}
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
          />
        ) : null}

        {error ? (
          <Text className="text-sm text-destructive">{error}</Text>
        ) : null}

        {body()}
      </ScrollView>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this blocker?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.isRecurring
                ? "This removes the blocker and all its recurrences. You'll start receiving auto-invitations again during these times."
                : "You'll start receiving auto-invitations again during this time."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              accessibilityLabel="Cancel deleting blocker"
              disabled={deleteBlocker.isPending}
            >
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="blocker-delete-confirm"
              accessibilityLabel="Confirm delete blocker"
              className="bg-destructive"
              disabled={deleteBlocker.isPending}
              onPress={handleDelete}
            >
              {deleteBlocker.isPending ? (
                <Spinner size="small" color="white" />
              ) : null}
              <Text className="text-destructive-foreground">
                {deleteBlocker.isPending ? "Deleting..." : "Delete"}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
