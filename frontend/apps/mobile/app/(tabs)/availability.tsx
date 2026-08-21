import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { AvailabilityBlocker } from "@levelup/api/src/resources/availability";
import { useAvailabilityBlockers } from "@levelup/hooks";
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

/** Module-level, so the translator is threaded in rather than hooked. Day
 * names come from availability.days.<n>, keyed by JS getDay(). */
function describeBlocker(
  b: AvailabilityBlocker,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const time = `${b.startTime ?? ""}–${b.endTime ?? ""}`;
  if (b.isRecurring && b.recurrenceRule) {
    const days = (b.recurrenceRule.daysOfWeek ?? [])
      .map((d) => t(`availability.days.${d}`))
      .filter(Boolean)
      .join(", ");
    return t("availability.everyDays", {
      days: days || t("availability.everyWeek"),
      time,
    });
  }
  return t("availability.dateAndTime", { date: b.date ?? "", time });
}

export default function AvailabilityScreen() {
  const { t } = useTranslation();
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
      setError(t("availability.couldNotSaveMessage"));
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
      setError(t("availability.couldNotRemoveMessage"));
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
          message={t("availability.couldNotLoadMessage")}
          onRetry={() => refetch()}
        />
      );
    }
    const items = blockers ?? [];
    if (items.length === 0 && !showForm) {
      return (
        <EmptyState
          icon="calendar-outline"
          title={t("availability.noBlockersTitle")}
          message={t("availability.noBlockersMessage")}
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
                  {b.title || t("availability.unavailable")}
                </Text>
                {b.isRecurring ? (
                  <Badge variant="secondary">
                    <Text>{t("availability.recurring")}</Text>
                  </Badge>
                ) : null}
                <Badge variant="outline">
                  <Text>{blockerTypeLabel(b.type, t)}</Text>
                </Badge>
              </View>
              <Text className="text-sm text-muted-foreground">
                {describeBlocker(b, t)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("availability.wontReceive")}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Pressable
                accessibilityLabel={t("availability.editBlockerAria")}
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
                accessibilityLabel={t("availability.deleteBlockerAria")}
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
    <Screen testID="screen-availability">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      >
        <Text className="text-sm text-muted-foreground">
          {t("availability.intro")}
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

      {!showForm ? (
        <Pressable
          testID="availability-add"
          accessibilityLabel={t("availability.addBlocker")}
          role="button"
          onPress={openCreate}
          className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-90"
        >
          <Ionicons name="add" size={28} color={lightTheme.primaryForeground} />
        </Pressable>
      ) : null}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("availability.deleteBlockerTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.isRecurring
                ? t("availability.deleteRecurringDescription")
                : t("availability.deleteSingleDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              accessibilityLabel={t("availability.cancelDeleteAria")}
              disabled={deleteBlocker.isPending}
            >
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="blocker-delete-confirm"
              accessibilityLabel={t("availability.confirmDeleteAria")}
              className="bg-destructive"
              disabled={deleteBlocker.isPending}
              onPress={handleDelete}
            >
              {deleteBlocker.isPending ? (
                <Spinner size="small" color="white" />
              ) : null}
              <Text className="text-destructive-foreground">
                {deleteBlocker.isPending
                  ? t("availability.deleting")
                  : t("common.delete")}
              </Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
