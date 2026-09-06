import { Ionicons } from "@expo/vector-icons";
import { effectiveFilledSpots, lightTheme } from "@levelup/config";
import {
  queryKeys,
  useAutoInviteEnabled,
  useClassInstance,
  useCoachLevels,
} from "@levelup/hooks";
import type { ClassInstance, PresenceStatus } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import {
  AlertDialog,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import { ClassScopeDialog } from "@/features/calendar/class-scope-dialog";
import {
  diffInstance,
  EDITABLE_CLASS_FIELDS,
} from "@/features/calendar/edit-class-diff";
import {
  useCancelAttendance,
  useConfirmClassTraining,
  useConfirmPresences,
  useEditClass,
  useRemoveClass,
  useSendClassReminders,
  type AttendancePayloadItem,
} from "@/features/calendar/hooks";
import { NotifyModal } from "@/features/calendar/notify-modal";
import { paramsToEvent, type ClassRouteParams } from "@/features/calendar/params";
import {
  ParticipantRow,
  playerName,
  type AttendanceState,
} from "@/features/calendar/ParticipantRow";
import { PlanningSection } from "@/features/calendar/planning-section";
import { useAppEvents } from "@/lib/sse";
import { cn } from "@/lib/utils";

const COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#6366f1",
];

function formatDay(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "EEE, MMM d");
  } catch {
    return dateStr;
  }
}

export default function ClassDetailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<ClassRouteParams>();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;
  const queryClient = useQueryClient();

  const event = React.useMemo(() => paramsToEvent(params), [
    params.id,
    params.model,
    params.originalId,
    params.date,
  ]);

  const {
    data: instance,
    isPending,
    isError,
    refetch,
  } = useClassInstance(event);

  const { data: levels } = useCoachLevels();
  const autoInviteEnabled = useAutoInviteEnabled(isCoach);

  // Attendance draft, initialised from server presences whenever they load.
  const [attendance, setAttendance] = React.useState<
    Record<string, AttendanceState>
  >({});
  React.useEffect(() => {
    if (!instance?.participants) return;
    const initial: Record<string, AttendanceState> = {};
    for (const participant of instance.participants) {
      const existing = instance.presences?.find(
        (presence) => String(presence.playerId) === String(participant.id)
      );
      initial[String(participant.id)] = {
        status: (existing?.status ?? null) as PresenceStatus | null,
        justification: existing?.justification,
      };
    }
    setAttendance(initial);
  }, [instance?.id, instance?.participants, instance?.presences]);

  const confirmPresences = useConfirmPresences();
  const removeClass = useRemoveClass();
  const cancelAttendance = useCancelAttendance();
  const editClass = useEditClass();
  const sendReminders = useSendClassReminders();
  const confirmTraining = useConfirmClassTraining();

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  // ── Edit mode (coach only) ──
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<ClassInstance | null>(null);
  const [editScopeOpen, setEditScopeOpen] = React.useState(false);
  const active = draft ?? instance ?? null;

  // ── Notify / invited ──
  const [showNotify, setShowNotify] = React.useState(false);
  const [invitationsOpen, setInvitationsOpen] = React.useState(false);

  // ── Training planning ──
  const [plannedExerciseIds, setPlannedExerciseIds] = React.useState<
    string[]
  >([]);
  const [isPlanningMode, setIsPlanningMode] = React.useState(false);
  const savedPlannedIdsRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    setPlannedExerciseIds(instance?.plannedExerciseIds ?? []);
    setIsPlanningMode(false);
  }, [instance?.id, instance?.plannedExerciseIds]);

  // Real-time invitation updates (mirrors web's ClassDetailSheet SSE handling).
  // Unlike web, notify_sent only refetches the CURRENTLY open instance's own
  // query key — web re-points its fetch at the event's raw lessonInstanceId,
  // which can diverge from what's on screen; this avoids that mismatch.
  useAppEvents(
    React.useCallback(
      (evt) => {
        if (!isCoach || !event) return;
        if (evt.type === "notification_responded") {
          const payload = evt.payload as {
            notificationEventId: number;
            response: string;
          };
          queryClient.setQueryData<ClassInstance>(
            queryKeys.classInstance(event),
            (old) =>
              old
                ? {
                    ...old,
                    invitations: (old.invitations ?? []).map((inv) =>
                      inv.id === payload.notificationEventId
                        ? {
                            ...inv,
                            status:
                              payload.response === "yes"
                                ? ("confirmed" as const)
                                : ("expired" as const),
                          }
                        : inv
                    ),
                  }
                : old
          );
          return;
        }
        if (evt.type === "notify_sent") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.classInstance(event),
          });
          setInvitationsOpen(true);
        }
      },
      [isCoach, event, queryClient]
    )
  );

  if (!event) {
    return (
      <Screen title={t("classDetail.classFallbackTitle")} testID="class-detail">
        <ErrorState message={t("classDetail.notFound")} />
      </Screen>
    );
  }

  const title =
    active?.name || event.title || t("classDetail.classFallbackTitle");
  const isCanceled = (active?.status ?? event.status) === "canceled";
  const isRecurring = event.isRecurring || instance?.isRecurring === true;
  const canApplyScope = event.isRecurring === true;

  const participants = instance?.participants ?? [];
  // PAD-71: same rule as the calendar event card's X/Y badge. Students only ever
  // receive their OWN presence row, so subtracting declines would under-count
  // their view — the guard keeps that behaviour unchanged.
  const filled = effectiveFilledSpots(
    participants.length,
    isCoach ? instance?.presences : []
  );
  const maxPlayers = active?.maxPlayers ?? event.maxPlayers ?? 0;

  const dateLabel =
    formatDay(active?.date || event.date) || (params.displayDate ?? "");
  const startTime = active?.startTime || event.startTime;
  const endTime = active?.endTime || event.endTime;
  const timeLabel =
    startTime && endTime
      ? `${startTime} – ${endTime}`
      : (params.displayTime ?? "");

  const levelOptions: Option[] = (levels ?? []).map((level) => ({
    value: level.id,
    label: level.label || level.code,
  }));
  const levelLabel =
    levels?.find((level) => level.id === active?.levelId)?.code ?? "—";

  const invitations = instance?.invitations ?? [];

  const hasMarkedAttendance = Object.values(attendance).some(
    (state) => state.status !== null
  );

  // ── Edit mode ──
  const startEdit = () => {
    if (!isCoach || !instance) return;
    setDraft(structuredClone(instance));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!draft || !instance) return;
    const changes = diffInstance(instance, draft, EDITABLE_CLASS_FIELDS);
    if (Object.keys(changes).length === 0) {
      setIsEditing(false);
      setDraft(null);
      return;
    }
    if (canApplyScope) {
      setEditScopeOpen(true);
    } else {
      void commitEdit("single");
    }
  };

  const commitEdit = async (scope: "single" | "future") => {
    if (!draft || !instance || !event) return;
    const changes = diffInstance(instance, draft, EDITABLE_CLASS_FIELDS);
    setEditScopeOpen(false);
    setIsEditing(false);
    if (Object.keys(changes).length === 0) {
      setDraft(null);
      return;
    }
    try {
      await editClass.mutateAsync({ event, updates: changes, scope });
      toast.success(t("calendar.page.classUpdated"));
    } catch {
      toast.error(
        t("calendar.page.updateFailed"),
        t("calendar.page.updateFailedDescription")
      );
    } finally {
      setDraft(null);
    }
  };

  // ── Remind ──
  const handleRemind = async () => {
    if (!event) return;
    try {
      const { sent } = await sendReminders.mutateAsync({
        model: event.model,
        originalId: String(event.originalId),
        date: event.date,
      });
      toast.success(t("calendar.detail.remindersSent", { count: sent }));
    } catch {
      toast.error(t("calendar.detail.failedSendReminders"));
    }
  };

  // ── Training planning ──
  const startPlanning = () => {
    savedPlannedIdsRef.current = [...plannedExerciseIds];
    setIsPlanningMode(true);
  };

  const cancelPlanning = () => {
    setPlannedExerciseIds(savedPlannedIdsRef.current);
    setIsPlanningMode(false);
  };

  const handleSaveTraining = async () => {
    if (!instance) return;
    try {
      const { plannedExerciseIds: saved } = await confirmTraining.mutateAsync(
        { classInstance: instance, exerciseIds: plannedExerciseIds }
      );
      setPlannedExerciseIds(saved);
      setIsPlanningMode(false);
      toast.success(t("calendar.detail.trainingSaved"));
    } catch {
      toast.error(t("calendar.detail.failedSaveTraining"));
    }
  };

  const handleConfirmAttendance = async () => {
    if (!instance) return;
    const payload = participants
      .map((participant) => {
        const state = attendance[String(participant.id)];
        return {
          playerId: String(participant.id),
          status: state?.status,
          justification: state?.justification,
        };
      })
      .filter((item) => item.status != null) as AttendancePayloadItem[];
    if (payload.length === 0) return;

    setFeedback(null);
    try {
      await confirmPresences.mutateAsync({
        classInstance: instance,
        presences: payload,
      });
      setFeedback(t("calendar.detail.attendanceSavedTitle"));
    } catch {
      setFeedback(t("calendar.detail.failedSaveAttendance"));
    }
  };

  const handleDelete = async (scope: "single" | "future") => {
    setDeleteOpen(false);
    try {
      await removeClass.mutateAsync({ event, scope });
      router.back();
    } catch {
      setFeedback(t("classDetail.deleteFailed"));
    }
  };

  // Student-only: their own presence row (the API only ever returns theirs).
  const myPresence = !isCoach ? (instance?.presences ?? [])[0] : undefined;
  const canCancelAttendance =
    !isCoach &&
    !isCanceled &&
    myPresence != null &&
    myPresence.status !== "absent";

  const handleCancelAttendance = async () => {
    setCancelOpen(false);
    if (!myPresence) return;
    setFeedback(null);
    try {
      await cancelAttendance.mutateAsync(Number(myPresence.lessonInstanceId));
      setFeedback(t("classDetail.spotReleased"));
    } catch {
      setFeedback(t("classDetail.couldNotCancelAttendance"));
    }
  };

  return (
    <Screen edges={["top"]} testID="class-detail">
      {/* Header */}
      <View className="flex-row items-center gap-2 border-b border-border px-2 py-2">
        <Pressable
          testID="class-detail-back"
          accessibilityLabel={t("common.back")}
          role="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="chevron-back" size={22} color={lightTheme.foreground} />
        </Pressable>
        {isEditing && draft ? (
          <Input
            testID="class-edit-name"
            accessibilityLabel={t("classDetail.classNameAria")}
            className="h-10 flex-1"
            value={draft.name ?? ""}
            onChangeText={(value) =>
              setDraft((d) => (d ? { ...d, name: value } : d))
            }
          />
        ) : (
          <Text
            role="heading"
            aria-level={1}
            className="flex-1 text-lg font-bold"
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
        {isCanceled ? (
          <Badge variant="destructive">
            <Text>{t("classDetail.canceled")}</Text>
          </Badge>
        ) : null}
      </View>

      {isError ? (
        <ErrorState
          message={t("classDetail.couldNotLoad")}
          onRetry={() => refetch()}
        />
      ) : isPending ? (
        <View className="gap-3 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4 pb-10">
          {/* Info cards: Date, Time, Capacity, Level (2×2, mirrors web's grid) */}
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={lightTheme.mutedForeground}
                  />
                  <Text className="text-xs text-muted-foreground">
                    {t("calendar.detail.date")}
                  </Text>
                </View>
                {isEditing && draft ? (
                  <View className="gap-2">
                    <DatePickerInput
                      testID="class-edit-date"
                      value={draft.date}
                      onChange={(value) =>
                        setDraft((d) => (d ? { ...d, date: value } : d))
                      }
                    />
                    {draft.recurrenceEnd && !draft.parentClassId ? (
                      <View className="gap-1">
                        <Text className="text-xs text-muted-foreground">
                          {t("calendar.detail.until")}
                        </Text>
                        <DatePickerInput
                          testID="class-edit-recurrence-end"
                          value={draft.recurrenceEnd}
                          onChange={(value) =>
                            setDraft((d) =>
                              d ? { ...d, recurrenceEnd: value } : d
                            )
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View>
                    <Text className="text-sm font-medium">
                      {dateLabel || "—"}
                    </Text>
                    {active?.recurrenceEnd && !active?.parentClassId ? (
                      <Text className="mt-0.5 text-xs text-muted-foreground">
                        {t("calendar.detail.untilDate", {
                          date: formatDay(active.recurrenceEnd),
                        })}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
              <View className="flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={lightTheme.mutedForeground}
                  />
                  <Text className="text-xs text-muted-foreground">
                    {t("calendar.detail.time")}
                  </Text>
                </View>
                {isEditing && draft ? (
                  <View className="gap-1.5">
                    <TimePickerInput
                      testID="class-edit-start-time"
                      value={draft.startTime}
                      onChange={(value) =>
                        setDraft((d) => (d ? { ...d, startTime: value } : d))
                      }
                    />
                    <TimePickerInput
                      testID="class-edit-end-time"
                      value={draft.endTime}
                      onChange={(value) =>
                        setDraft((d) => (d ? { ...d, endTime: value } : d))
                      }
                    />
                  </View>
                ) : (
                  <Text className="text-sm font-medium">
                    {timeLabel || "—"}
                  </Text>
                )}
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name="people-outline"
                    size={14}
                    color={lightTheme.mutedForeground}
                  />
                  <Text className="text-xs text-muted-foreground">
                    {t("calendar.detail.capacity")}
                  </Text>
                </View>
                {isEditing && draft ? (
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      testID="class-edit-max-players-decrement"
                      accessibilityLabel={t("classDetail.decreaseCapacityAria")}
                      role="button"
                      onPress={() =>
                        setDraft((d) =>
                          d
                            ? { ...d, maxPlayers: Math.max(1, d.maxPlayers - 1) }
                            : d
                        )
                      }
                      className="h-7 w-7 items-center justify-center rounded-md border border-input active:bg-accent"
                    >
                      <Ionicons name="remove" size={14} color={lightTheme.foreground} />
                    </Pressable>
                    <Text className="w-6 text-center text-sm font-semibold">
                      {draft.maxPlayers}
                    </Text>
                    <Pressable
                      testID="class-edit-max-players-increment"
                      accessibilityLabel={t("classDetail.increaseCapacityAria")}
                      role="button"
                      onPress={() =>
                        setDraft((d) =>
                          d ? { ...d, maxPlayers: d.maxPlayers + 1 } : d
                        )
                      }
                      className="h-7 w-7 items-center justify-center rounded-md border border-input active:bg-accent"
                    >
                      <Ionicons name="add" size={14} color={lightTheme.foreground} />
                    </Pressable>
                  </View>
                ) : (
                  <Text className="text-sm font-medium">
                    {maxPlayers ? `${filled}/${maxPlayers}` : "—"}
                  </Text>
                )}
              </View>
              <View className="flex-1 gap-2 rounded-lg border border-border bg-card p-3">
                <Text className="text-xs text-muted-foreground">
                  {t("calendar.detail.level")}
                </Text>
                {isEditing && draft ? (
                  <Select
                    value={levelOptions.find((o) => o!.value === draft.levelId)}
                    onValueChange={(opt) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              levelId: (opt?.value as string) || undefined,
                            }
                          : d
                      )
                    }
                  >
                    <SelectTrigger
                      testID="class-edit-level-select"
                      accessibilityLabel={t("classDetail.classLevelAria")}
                      className="h-9"
                    >
                      <SelectValue
                        placeholder={t("calendar.detail.selectPlaceholder")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {levelOptions.map((opt) => (
                        <SelectItem
                          key={opt!.value}
                          value={opt!.value}
                          label={opt!.label}
                        />
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Text className="text-sm font-medium">{levelLabel}</Text>
                )}
              </View>
            </View>
          </View>

          {isRecurring && !isEditing ? (
            <View className="flex-row items-center gap-1.5">
              <Ionicons
                name="repeat-outline"
                size={14}
                color={lightTheme.mutedForeground}
              />
              <Text className="text-xs text-muted-foreground">
                {/* Two whole sentences rather than a translated "until"
                    glued onto an English stem — the separator and word
                    order are the translator's to choose. */}
                {instance?.recurrenceEnd
                  ? t("calendar.detail.recurringClassUntil", {
                      date: formatDay(instance.recurrenceEnd),
                    })
                  : t("calendar.detail.recurringClass")}
              </Text>
            </View>
          ) : null}

          {/* Auto-notifications toggle (coach only, gated by the coach's
              global auto-invite setting like web's ClassDetailSheet). */}
          {isCoach && event.type === "class" && autoInviteEnabled ? (
            <View className="rounded-lg border border-border bg-card p-3">
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1 flex-row items-center gap-2">
                  <Ionicons
                    name="notifications-outline"
                    size={16}
                    color={lightTheme.mutedForeground}
                  />
                  <View className="flex-1">
                    <Text className="text-sm font-medium">
                      {t("calendar.detail.autoNotifications")}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {t("calendar.detail.autoNotificationsDescription")}
                    </Text>
                  </View>
                </View>
                <Switch
                  testID="class-auto-notify-toggle"
                  accessibilityLabel={t("calendar.detail.autoNotifications")}
                  checked={active?.notificationsEnabled ?? false}
                  onCheckedChange={(checked) =>
                    setDraft((d) =>
                      d ? { ...d, notificationsEnabled: checked } : d
                    )
                  }
                  disabled={!isEditing}
                />
              </View>
            </View>
          ) : null}

          {/* Color — only in edit mode (mirrors web) */}
          {isEditing && draft ? (
            <View className="gap-2 rounded-lg border border-border bg-card p-3">
              <Text className="text-xs font-medium text-muted-foreground">
                {t("calendar.detail.color")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {COLORS.map((color) => (
                  <Pressable
                    key={color}
                    testID={`class-edit-color-${color.slice(1)}`}
                    accessibilityLabel={t("calendar.detail.colorOption", { color })}
                    role="button"
                    onPress={() =>
                      setDraft((d) => (d ? { ...d, color } : d))
                    }
                    className={cn(
                      "h-8 w-8 rounded-full",
                      draft.color === color && "border-2 border-primary"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Separator />

          {/* Participants + attendance */}
          <View className="gap-2">
            <Text className="text-sm font-semibold">
              Participants ({participants.length}/{maxPlayers || "—"})
            </Text>
            {participants.length === 0 ? (
              <Text className="text-sm text-muted-foreground">
                {t("calendar.detail.noParticipants")}
              </Text>
            ) : (
              participants.map((participant) => (
                <ParticipantRow
                  key={String(participant.id)}
                  player={participant}
                  presence={instance?.presences?.find(
                    (presence) =>
                      String(presence.playerId) === String(participant.id)
                  )}
                  attendance={
                    attendance[String(participant.id)] ?? { status: null }
                  }
                  onChange={(state) =>
                    setAttendance((prev) => ({
                      ...prev,
                      [String(participant.id)]: state,
                    }))
                  }
                  canMark={isCoach && !isCanceled && !isEditing}
                />
              ))
            )}

            {isCoach && participants.length > 0 && !isCanceled && !isEditing ? (
              <Button
                testID="attendance-confirm"
                accessibilityLabel={t("classDetail.confirmAttendance")}
                onPress={handleConfirmAttendance}
                disabled={!hasMarkedAttendance || confirmPresences.isPending}
                className="mt-1"
              >
                {confirmPresences.isPending ? (
                  <Spinner color={lightTheme.primaryForeground} />
                ) : null}
                <Text>{t("classDetail.confirmAttendance")}</Text>
              </Button>
            ) : null}
          </View>

          {/* Invited (N) — coach only, collapsible, live via SSE above. */}
          {isCoach && !isEditing && invitations.length > 0 ? (
            <>
              <Separator />
              <View className="gap-2">
                <Pressable
                  testID="class-invited-toggle"
                  accessibilityLabel={t("calendar.detail.invitedCount", {
                      count: invitations.length,
                    })}
                  role="button"
                  onPress={() => setInvitationsOpen((open) => !open)}
                  className="flex-row items-center justify-between py-1"
                >
                  <Text className="text-sm font-semibold">
                    {t("calendar.detail.invited", {
                      count: invitations.length,
                    })}
                  </Text>
                  <Ionicons
                    name={invitationsOpen ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={lightTheme.mutedForeground}
                  />
                </Pressable>
                {invitationsOpen ? (
                  <View className="gap-1.5">
                    {invitations.map((inv) => (
                      <View
                        key={inv.id}
                        className="flex-row items-center justify-between py-1"
                      >
                        <Text className="flex-1 text-sm" numberOfLines={1}>
                          {inv.playerName}
                        </Text>
                        {inv.status === "confirmed" ? (
                          <Badge variant="success">
                            <Text>{t("calendar.detail.accepted")}</Text>
                          </Badge>
                        ) : inv.status === "expired" ? (
                          <Badge variant="destructive">
                            <Text>{t("calendar.detail.declined")}</Text>
                          </Badge>
                        ) : inv.status === "queued" ? (
                          <Badge variant="secondary">
                            <Text>{t("calendar.detail.queued")}</Text>
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Text>{t("calendar.detail.pending")}</Text>
                          </Badge>
                        )}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {/* Student: own status + cancel attendance */}
          {!isCoach && myPresence ? (
            <>
              <Separator />
              <View className="gap-2">
                <Text className="text-sm font-semibold">
                  {t("classDetail.yourAttendance")}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Badge
                    variant={
                      myPresence.status === "absent"
                        ? "destructive"
                        : myPresence.confirmed
                          ? "success"
                          : "secondary"
                    }
                  >
                    <Text>
                      {myPresence.status === "present"
                        ? t("calendar.attendance.present")
                        : myPresence.status === "absent"
                          ? t("calendar.attendance.absent")
                          : myPresence.confirmed
                            ? t("classDetail.statusConfirmed")
                            : myPresence.invited
                              ? t("classDetail.statusInvited")
                              : t("classDetail.statusRegistered")}
                    </Text>
                  </Badge>
                </View>
                {canCancelAttendance ? (
                  <Button
                    testID="class-cancel-attendance"
                    accessibilityLabel={t("calendar.detail.cancelAttendance")}
                    variant="outline"
                    onPress={() => setCancelOpen(true)}
                    disabled={cancelAttendance.isPending}
                  >
                    <Text className="text-destructive">
                      {t("calendar.detail.cancelAttendance")}
                    </Text>
                  </Button>
                ) : null}
              </View>
            </>
          ) : null}

          {feedback ? (
            <Text className="text-center text-sm text-muted-foreground">
              {feedback}
            </Text>
          ) : null}

          {/* Training planning — coach only */}
          {isCoach ? (
            <>
              <Separator />
              <PlanningSection
                exerciseIds={plannedExerciseIds}
                onChange={setPlannedExerciseIds}
                disabled={isEditing}
                isEditing={isPlanningMode}
                onEditStart={startPlanning}
              />
              {isPlanningMode ? (
                <View className="flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onPress={cancelPlanning}
                    disabled={confirmTraining.isPending}
                  >
                    <Text>{t("common.cancel")}</Text>
                  </Button>
                  <Button
                    testID="class-planning-save"
                    accessibilityLabel={t("classDetail.saveTrainingPlanAria")}
                    className="flex-1"
                    onPress={() => void handleSaveTraining()}
                    disabled={confirmTraining.isPending}
                  >
                    {confirmTraining.isPending ? (
                      <Spinner color={lightTheme.primaryForeground} />
                    ) : null}
                    <Text>
                      {confirmTraining.isPending
                        ? t("calendar.detail.saving")
                        : t("calendar.detail.confirm")}
                    </Text>
                  </Button>
                </View>
              ) : null}
            </>
          ) : null}

          {/* Coach actions: edit / notify / remind / delete */}
          {isCoach && !isEditing ? (
            <>
              <Separator />
              <View className="flex-row flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  testID="class-edit"
                  accessibilityLabel={t("classDetail.editClassAria")}
                  onPress={startEdit}
                >
                  <Ionicons
                    name="pencil-outline"
                    size={16}
                    color={lightTheme.foreground}
                  />
                  <Text>{t("calendar.detail.edit")}</Text>
                </Button>
                {event.type === "class" ? (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1"
                      testID="class-notify"
                      accessibilityLabel={t("classDetail.notifyStudentsAria")}
                      onPress={() => setShowNotify(true)}
                    >
                      <Ionicons
                        name="send-outline"
                        size={16}
                        color={lightTheme.foreground}
                      />
                      <Text>{t("calendar.detail.notify")}</Text>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      testID="class-remind"
                      accessibilityLabel={t("classDetail.sendRemindersAria")}
                      disabled={sendReminders.isPending}
                      onPress={() => void handleRemind()}
                    >
                      {sendReminders.isPending ? (
                        <Spinner size="small" color={lightTheme.foreground} />
                      ) : (
                        <Ionicons
                          name="notifications-outline"
                          size={16}
                          color={lightTheme.foreground}
                        />
                      )}
                      <Text>
                        {sendReminders.isPending
                          ? t("calendar.detail.sending")
                          : t("calendar.detail.remind")}
                      </Text>
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="outline"
                  className="flex-1"
                  testID="class-delete"
                  accessibilityLabel={t("calendar.detail.deleteClass")}
                  onPress={() => setDeleteOpen(true)}
                  disabled={removeClass.isPending}
                >
                  {removeClass.isPending ? (
                    <Spinner color={lightTheme.destructive} />
                  ) : (
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={lightTheme.destructive}
                    />
                  )}
                  <Text className="text-destructive">
                    {t("calendar.detail.delete")}
                  </Text>
                </Button>
              </View>
            </>
          ) : null}

          {isEditing ? (
            <View className="flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1"
                testID="class-edit-cancel"
                accessibilityLabel={t("classDetail.cancelEditingAria")}
                onPress={cancelEdit}
                disabled={editClass.isPending}
              >
                <Text>{t("common.cancel")}</Text>
              </Button>
              <Button
                className="flex-1"
                testID="class-edit-save"
                accessibilityLabel={t("classDetail.saveChangesAria")}
                onPress={saveEdit}
                disabled={editClass.isPending}
              >
                {editClass.isPending ? (
                  <Spinner color={lightTheme.primaryForeground} />
                ) : null}
                <Text>
                  {editClass.isPending
                    ? t("calendar.detail.saving")
                    : t("common.save")}
                </Text>
              </Button>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Edit scope choice for recurring classes */}
      <ClassScopeDialog
        open={editScopeOpen}
        mode="edit"
        onClose={() => setEditScopeOpen(false)}
        onConfirm={(scope) => void commitEdit(scope)}
      />

      {/* Manual notification picker */}
      {event.type === "class" ? (
        <NotifyModal
          open={showNotify}
          onClose={() => setShowNotify(false)}
          event={event}
          existingPlayerIds={participants.map((p) => String(p.id))}
          onSent={() => setInvitationsOpen(true)}
        />
      ) : null}

      {/* Delete confirmation (scope choice for recurring classes) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("calendar.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {isRecurring
                ? t("classDetail.deleteRecurringDescription")
                : t("classDetail.deleteSingleDescription", { title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isRecurring ? (
              <>
                <Button
                  testID="class-delete-confirm"
                  accessibilityLabel={t("classDetail.deleteOnlyThisAria")}
                  variant="destructive"
                  onPress={() => handleDelete("single")}
                >
                  <Text>{t("calendar.deleteDialog.singleTitle")}</Text>
                </Button>
                <Button
                  testID="class-delete-confirm-future"
                  accessibilityLabel={t("classDetail.deleteFutureAria")}
                  variant="destructive"
                  onPress={() => handleDelete("future")}
                >
                  <Text>{t("calendar.deleteDialog.futureTitle")}</Text>
                </Button>
              </>
            ) : (
              <Button
                testID="class-delete-confirm"
                accessibilityLabel={t("classDetail.confirmDeleteAria")}
                variant="destructive"
                onPress={() => handleDelete("single")}
              >
                <Text>{t("calendar.detail.delete")}</Text>
              </Button>
            )}
            <AlertDialogCancel testID="class-delete-cancel">
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Student cancel-attendance confirmation */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("calendar.detail.cancelAttendance")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("classDetail.cancelAttendanceDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              testID="class-cancel-attendance-confirm"
              accessibilityLabel={t("classDetail.confirmCancelAttendanceAria")}
              variant="destructive"
              onPress={handleCancelAttendance}
            >
              <Text>{t("classDetail.cancelMySpot")}</Text>
            </Button>
            <AlertDialogCancel>
              <Text>{t("calendar.detail.keepAttendance")}</Text>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
