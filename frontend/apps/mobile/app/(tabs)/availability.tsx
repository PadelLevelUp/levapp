import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { lightTheme, type BlockerDraftInput } from "@levelup/config";
import type { AvailabilityBlocker } from "@levelup/api/src/resources/availability";
import { useAvailabilityBlockers } from "@levelup/hooks";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { ClassRequestsSection } from "@/features/class-requests/class-requests-section";
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
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { BlockerSheet } from "@/features/availability/BlockerSheet";
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

/**
 * The student's Disponibilidade tab (calendar.student-blockers rule 14,
 * PAD-356): two cards, each with an explanation and its own call to action,
 * and no floating "+". Blocks are created and edited in a sheet (rule 15);
 * the class-requests card (`classes.class-requests`) is the second card.
 */
export default function AvailabilityScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ proposeFor?: string }>();
  const proposeFor = params.proposeFor ? Number(params.proposeFor) : null;
  const { data: blockers, isPending, isError, refetch } =
    useAvailabilityBlockers();
  const createBlocker = useCreateBlocker();
  const updateBlocker = useUpdateBlocker();
  const deleteBlocker = useDeleteBlocker();

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AvailabilityBlocker | null>(
    null
  );
  const [pendingDelete, setPendingDelete] =
    React.useState<AvailabilityBlocker | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [removeError, setRemoveError] = React.useState<string | null>(null);

  const saving = createBlocker.isPending || updateBlocker.isPending;

  const openCreate = () => {
    setEditing(null);
    setSaveError(null);
    setSheetOpen(true);
  };

  const openEdit = (blocker: AvailabilityBlocker) => {
    setEditing(blocker);
    setSaveError(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (payload: BlockerDraftInput) => {
    setSaveError(null);
    try {
      if (editing) {
        await updateBlocker.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createBlocker.mutateAsync(payload);
      }
      closeSheet();
    } catch {
      setSaveError(t("availability.couldNotSaveMessage"));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setRemoveError(null);
    try {
      await deleteBlocker.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch {
      setPendingDelete(null);
      setRemoveError(t("availability.couldNotRemoveMessage"));
    }
  };

  const blockerList = () => {
    if (isPending) {
      return (
        <View className="gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
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
    if (items.length === 0) {
      return (
        <EmptyState
          testID="availability-blockers-empty"
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
            className="flex-row items-center gap-3 rounded-lg border border-border bg-background p-3"
          >
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-medium" numberOfLines={1}>
                  {b.title || t("availability.unavailable")}
                </Text>
                {b.isRecurring ? (
                  <Badge variant="secondary" testID={`blocker-recurring-${b.id}`}>
                    <Text>{t("availability.recurring")}</Text>
                  </Badge>
                ) : null}
              </View>
              <Text className="text-sm text-muted-foreground">
                {describeBlocker(b, t)}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Pressable
                testID={`blocker-edit-${b.id}`}
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
        {/* Rule 14: Indisponibilidade — explanation, Criar bloqueio, the blocks. */}
        <Card testID="availability-blockers-card">
          <CardContent className="gap-4 p-4">
            <View className="gap-1">
              <Text className="text-base font-semibold">
                {t("availability.blockersCard.title")}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t("availability.blockersCard.intro")}
              </Text>
            </View>
            <Button
              testID="availability-create-blocker"
              accessibilityLabel={t("availability.blockersCard.cta")}
              onPress={openCreate}
            >
              <Ionicons name="add" size={18} color={lightTheme.primaryForeground} />
              <Text>{t("availability.blockersCard.cta")}</Text>
            </Button>
            {removeError ? (
              <Text className="text-sm text-destructive">{removeError}</Text>
            ) : null}
            {blockerList()}
          </CardContent>
        </Card>

        {/* Rule 14: Pedidos de aula — classes.class-requests as the second card.
            PAD-281: `?proposeFor=<id>` (from the chat bubble) opens the
            "propose another time" picker on that request. */}
        <ClassRequestsSection role="student" proposeFor={proposeFor} />
      </ScrollView>

      <BlockerSheet
        open={sheetOpen}
        initial={editing}
        saving={saving}
        error={saveError}
        onSubmit={handleSubmit}
        onClose={closeSheet}
      />

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
