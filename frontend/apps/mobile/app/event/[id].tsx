import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  View,
} from "react-native";
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
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import { ClassScopeDialog } from "@/features/calendar/class-scope-dialog";
import {
  BLOCK_TYPES,
  EVENT_END_DATE_PATTERN,
  blockToDraft,
  draftToPayload,
  formatEventDate,
  type EventDraft,
} from "@/features/calendar/event-draft";
import {
  useCalendarBlock,
  useEditEvent,
  useRemoveEvent,
} from "@/features/calendar/hooks";
import { useDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

// Monday-first, matching web's EventDetailSheet and app/event/new.tsx.
const DAYS_OF_WEEK = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

function capitalize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Detail screen for a non-class calendar event — personal, break, holiday or
 * off-work (PAD-160).
 *
 * iOS could CREATE these (app/event/new.tsx) but never open one again: the
 * card was inert and every calendar tap routed to /class/[id]. Changing or
 * removing a blocker meant opening the web app. This is the missing half,
 * mirroring web's `EventDetailSheet`: view, edit, and delete with the same
 * this-one / all-future scope choice a recurring class gets.
 */
export default function EventDetailScreen() {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const params = useLocalSearchParams<{
    id?: string;
    originalId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    title?: string;
  }>();

  const originalId = Number(params.originalId);
  const occDate = typeof params.date === "string" ? params.date : "";

  const { data: block, isPending, isError } = useCalendarBlock(
    Number.isFinite(originalId) ? originalId : null
  );
  const editEvent = useEditEvent();
  const removeEvent = useRemoveEvent();

  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<EventDraft | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteScopeOpen, setDeleteScopeOpen] = React.useState(false);

  const TYPE_OPTIONS: Option[] = BLOCK_TYPES.map((value) => ({
    value,
    label: t(`calendar.eventDetail.type${capitalize(value)}`),
  }));

  // Read-only view and edit form render from the same shape, so the screen
  // never has two sources of truth for what it is showing.
  const active: EventDraft = React.useMemo(
    () =>
      draft ??
      blockToDraft(block, {
        date: occDate,
        startTime: typeof params.startTime === "string" ? params.startTime : "",
        endTime: typeof params.endTime === "string" ? params.endTime : "",
      }),
    [draft, block, occDate, params.startTime, params.endTime]
  );

  const startEdit = () => setDraft(active);
  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
  };

  React.useEffect(() => {
    if (draft) setIsEditing(true);
  }, [draft]);

  const patch = (changes: Partial<EventDraft>) =>
    setDraft((d) => ({ ...(d ?? active), ...changes }));

  const toggleDay = (day: number) =>
    patch({
      selectedDays: active.selectedDays.includes(day)
        ? active.selectedDays.filter((d) => d !== day)
        : [...active.selectedDays, day],
    });

  const handleSave = async () => {
    if (!draft) return;
    try {
      await editEvent.mutateAsync({
        blockId: originalId,
        data: draftToPayload(draft),
      });
      setIsEditing(false);
      setDraft(null);
      toast.success(t("calendar.eventDetail.eventUpdated"));
    } catch {
      toast.error(t("calendar.eventDetail.failedUpdateEvent"));
    }
  };

  const handleDelete = () => {
    // Recurring blocks get the same this-one / all-future choice a recurring
    // class does; a one-off just confirms.
    if (active.isRecurring) setDeleteScopeOpen(true);
    else setDeleteOpen(true);
  };

  const confirmDelete = async (scope?: "single" | "future") => {
    setDeleteOpen(false);
    setDeleteScopeOpen(false);
    try {
      await removeEvent.mutateAsync({ blockId: originalId, occDate, scope });
      toast.success(t("calendar.eventDetail.eventDeleted"));
      router.back();
    } catch {
      toast.error(t("calendar.eventDetail.failedDeleteEvent"));
    }
  };

  const headerTitle =
    active.title || (typeof params.title === "string" ? params.title : "") ||
    t(`calendar.eventDetail.type${capitalize(active.type)}`);

  return (
    <Screen edges={["top"]} testID="event-detail">
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          testID="event-detail-back"
          accessibilityLabel={t("common.back")}
          role="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={22} color={lightTheme.foreground} />
        </Pressable>
        <Text
          role="heading"
          aria-level={1}
          numberOfLines={1}
          className="flex-1 text-lg font-bold"
        >
          {headerTitle}
        </Text>
        {!isPending && !isError ? (
          <Pressable
            testID="event-detail-delete"
            accessibilityLabel={t("calendar.eventDetail.deleteTitle")}
            role="button"
            onPress={handleDelete}
            className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons name="trash-outline" size={20} color={lightTheme.destructive} />
          </Pressable>
        ) : null}
      </View>

      {isError ? (
        <ErrorState message={t("calendar.eventDetail.failedLoadEvent")} />
      ) : isPending ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={keyboardAvoidingBehavior()}
        >
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-12"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Type */}
            <View className="gap-1.5">
              <Label>{t("calendar.eventDetail.type")}</Label>
              {isEditing ? (
                <Select
                  value={TYPE_OPTIONS.find((o) => o!.value === active.type)}
                  onValueChange={(option) =>
                    option &&
                    patch({ type: option.value as EventDraft["type"] })
                  }
                >
                  <SelectTrigger
                    testID="event-detail-type"
                    accessibilityLabel={t("calendar.eventDetail.type")}
                  >
                    <SelectValue placeholder={t("calendar.eventDetail.type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((option) => (
                      <SelectItem
                        key={option!.value}
                        value={option!.value}
                        label={option!.label}
                      />
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Text className="text-base">
                  {t(`calendar.eventDetail.type${capitalize(active.type)}`)}
                </Text>
              )}
            </View>

            {/* Title */}
            <View className="gap-1.5">
              <Label>{t("calendar.eventDetail.title")}</Label>
              {isEditing ? (
                <Input
                  testID="event-detail-title"
                  accessibilityLabel={t("calendar.eventDetail.title")}
                  placeholder={t("calendar.eventDetail.titlePlaceholder")}
                  value={active.title}
                  onChangeText={(value) => patch({ title: value })}
                />
              ) : (
                <Text className="text-base">{active.title || "—"}</Text>
              )}
            </View>

            {/* Description */}
            <View className="gap-1.5">
              <Label>{t("calendar.eventDetail.description")}</Label>
              {isEditing ? (
                <Input
                  testID="event-detail-description"
                  accessibilityLabel={t("calendar.eventDetail.description")}
                  placeholder={t("calendar.eventDetail.descriptionPlaceholder")}
                  value={active.description}
                  onChangeText={(value) => patch({ description: value })}
                />
              ) : (
                <Text className="text-base">{active.description || "—"}</Text>
              )}
            </View>

            {/* Date + times */}
            {isEditing ? (
              <>
                <DatePickerInput
                  testID="event-detail-date"
                  label={t("calendar.detail.date")}
                  value={active.date}
                  onChange={(value) => patch({ date: value })}
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <TimePickerInput
                      testID="event-detail-start"
                      label={t("calendar.addEvent.startShort")}
                      value={active.startTime}
                      onChange={(value) => patch({ startTime: value })}
                    />
                  </View>
                  <View className="flex-1">
                    <TimePickerInput
                      testID="event-detail-end"
                      label={t("calendar.addEvent.endShort")}
                      value={active.endTime}
                      onChange={(value) => patch({ endTime: value })}
                    />
                  </View>
                </View>
              </>
            ) : (
              <View className="gap-1.5">
                <Label>{t("calendar.detail.date")}</Label>
                <Text className="text-base">
                  {formatEventDate(active.date, dateLocale)} ·{" "}
                  {active.startTime}–{active.endTime}
                </Text>
              </View>
            )}

            {/* Recurrence */}
            <View className="gap-3 rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="repeat-outline"
                    size={16}
                    color={lightTheme.mutedForeground}
                  />
                  <Text className="text-sm font-medium">
                    {t("calendar.eventDetail.recurring")}
                  </Text>
                </View>
                {isEditing ? (
                  <Switch
                    testID="event-detail-recurring-switch"
                    accessibilityLabel={t("calendar.eventDetail.recurring")}
                    checked={active.isRecurring}
                    onCheckedChange={(checked) =>
                      patch({ isRecurring: checked })
                    }
                  />
                ) : (
                  <Text className="text-sm text-muted-foreground">
                    {active.isRecurring
                      ? t("calendar.eventDetail.yes")
                      : t("calendar.eventDetail.no")}
                  </Text>
                )}
              </View>

              {active.isRecurring ? (
                <>
                  <View className="gap-1.5">
                    <Text className="text-xs text-muted-foreground">
                      {t("calendar.eventDetail.daysOfWeek")}
                    </Text>
                    <View className="flex-row gap-1.5">
                      {DAYS_OF_WEEK.map(({ value, label }) => {
                        const selected = active.selectedDays.includes(value);
                        return (
                          <Pressable
                            key={value}
                            testID={`event-detail-day-${value}`}
                            accessibilityLabel={t(
                              "calendar.eventDetail.repeatOnDay",
                              { day: value }
                            )}
                            role="button"
                            disabled={!isEditing}
                            onPress={() => toggleDay(value)}
                            className={cn(
                              "h-9 w-9 items-center justify-center rounded-full",
                              selected ? "bg-primary" : "bg-muted"
                            )}
                          >
                            <Text
                              className={cn(
                                "text-xs font-medium",
                                selected
                                  ? "text-primary-foreground"
                                  : "text-foreground"
                              )}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {isEditing ? (
                    <DatePickerInput
                      testID="event-detail-end-date"
                      label={t("calendar.eventDetail.endDate")}
                      value={active.endDate}
                      onChange={(value) => patch({ endDate: value })}
                    />
                  ) : active.endDate ? (
                    <View className="gap-1.5">
                      <Text className="text-xs text-muted-foreground">
                        {t("calendar.eventDetail.endDate")}
                      </Text>
                      <Text className="text-base">
                        {formatEventDate(
                          active.endDate,
                          dateLocale,
                          EVENT_END_DATE_PATTERN
                        )}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>

            {/* Actions */}
            {isEditing ? (
              <View className="flex-row gap-3">
                <Button
                  testID="event-detail-cancel"
                  accessibilityLabel={t("calendar.eventDetail.cancel")}
                  variant="outline"
                  className="flex-1"
                  onPress={cancelEdit}
                  disabled={editEvent.isPending}
                >
                  <Text>{t("calendar.eventDetail.cancel")}</Text>
                </Button>
                <Button
                  testID="event-detail-save"
                  accessibilityLabel={t("calendar.eventDetail.save")}
                  className="flex-1"
                  onPress={() => void handleSave()}
                  disabled={editEvent.isPending}
                >
                  {editEvent.isPending ? (
                    <Spinner size="small" color={lightTheme.primaryForeground} />
                  ) : null}
                  <Text>
                    {editEvent.isPending
                      ? t("calendar.eventDetail.saving")
                      : t("calendar.eventDetail.save")}
                  </Text>
                </Button>
              </View>
            ) : (
              <Button
                testID="event-detail-edit"
                accessibilityLabel={t("calendar.eventDetail.edit")}
                onPress={startEdit}
              >
                <Text>{t("calendar.eventDetail.edit")}</Text>
              </Button>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* One-off delete: plain confirm. `calendar.deleteDialog.*` and
          `calendar.scope.*` are both class-worded ("Delete class") — an event
          gets its own copy under `calendar.eventDetail.*`. */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("calendar.eventDetail.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("calendar.eventDetail.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              testID="event-delete-cancel"
              accessibilityLabel={t("calendar.eventDetail.cancel")}
              onPress={() => setDeleteOpen(false)}
            >
              <Text>{t("calendar.eventDetail.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="event-delete-confirm"
              accessibilityLabel={t("calendar.eventDetail.delete")}
              onPress={() => void confirmDelete()}
            >
              <Text>{t("calendar.eventDetail.delete")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recurring delete: this occurrence or all future ones. `keyPrefix`
          swaps the dialog's class-worded copy ("Eliminar aula") for the
          event-worded `calendar.eventScope.*` — a personal event is not a
          class, and web's EventDetailSheet passes the same prefix. */}
      <ClassScopeDialog
        open={deleteScopeOpen}
        mode="delete"
        keyPrefix="calendar.eventScope"
        onClose={() => setDeleteScopeOpen(false)}
        onConfirm={(scope) => void confirmDelete(scope)}
      />
    </Screen>
  );
}
