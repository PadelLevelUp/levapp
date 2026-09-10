import { Ionicons } from "@expo/vector-icons";
import {
  CLASS_COLOR_SWATCHES,
  blockedNames,
  blockedReasons,
  effectiveFilledSpots,
  findOverlappingEvent,
  lightTheme,
  shouldReportSent,
  splitBlockedByCause,
} from "@levelup/config";
import {
  queryKeys,
  useAutoInviteEnabled,
  useCalendarEvents,
  useClassInstance,
  useCoachLevels,
} from "@levelup/hooks";
import type {
  ApprovalBundle,
  ClassInstance,
  PresenceStatus,
} from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import type { Locale } from "date-fns";
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
import { useDateLocale } from "@/lib/date-locale";
import { TimePickerInput } from "@/components/ui/time-picker-input";
import { toast } from "@/components/ui/toast";
import {
  canCancelAttendance,
  canDeclineProactively,
  hasDeclined,
} from "@/features/calendar/attendance-decline";
import { ClassScopeDialog } from "@/features/calendar/class-scope-dialog";
import { OverlapConfirmDialog } from "@/features/calendar/overlap-confirm-dialog";
import { ClassEligibilityBlock } from "@/features/calendar/class-eligibility-block";
import { EligibilityConfirmDialog } from "@/features/calendar/eligibility-confirm-dialog";
import * as notificationEngineApi from "@levelup/api/src/resources/notificationEngine";
import * as classJoinRequestsApi from "@levelup/api/src/resources/classJoinRequests";
import type { EligibilityCheckEntry } from "@levelup/types";
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
import { ReplacementApprovalCard } from "@/features/notifications/replacement-approval-card";
import { paramsToEvent, type ClassRouteParams } from "@/features/calendar/params";
import {
  ParticipantRow,
  playerName,
  type AttendanceState,
} from "@/features/calendar/ParticipantRow";
import { PlanningSection } from "@/features/calendar/planning-section";
import { useAppEvents } from "@/lib/sse";
import { cn } from "@/lib/utils";

// PAD-246: one shared palette for every picker — calendar.mobile-views rule 6.
const COLORS: readonly string[] = CLASS_COLOR_SWATCHES;

function formatDay(dateStr: string | undefined, locale: Locale): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "EEE, d MMM", { locale });
  } catch {
    return dateStr;
  }
}

export default function ClassDetailScreen() {
  const { t } = useTranslation();
  const locale = useDateLocale();
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
  // PAD-170 C5: distinct from `cancelOpen` — a proactive decline gets its own
  // confirmation, with no deadline warning, because by definition it happens
  // before the student was even reminded.
  const [proactiveDeclineOpen, setProactiveDeclineOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  // PAD-168: semi-automatic mode returns the vacancies awaiting approval from
  // the presence-confirm call; it is only ever set by that response.
  const [approvalBundle, setApprovalBundle] =
    React.useState<ApprovalBundle | null>(null);

  // ── Edit mode (coach only) ──
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<ClassInstance | null>(null);
  const [editScopeOpen, setEditScopeOpen] = React.useState(false);
  const [overlapOpen, setOverlapOpen] = React.useState(false);

  // PAD-159: the day's other events, for the overlap check on a timing edit.
  // Keyed off the DRAFT's date so moving the class to another day checks the
  // day it is moving TO, not the one it came from.
  const overlapDate = draft?.date ?? instance?.date ?? "";
  const { data: dayEvents } = useCalendarEvents(
    overlapDate ? `${overlapDate}T00:00:00` : "",
    overlapDate ? `${overlapDate}T23:59:59` : ""
  );
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
        // PAD-131: a student asked to join, or the class filled and the
        // requests closed → refetch so the requests block is current.
        if (evt.type === "join_request_created" || evt.type === "join_requests_superseded") {
          void queryClient.invalidateQueries({ queryKey: queryKeys.classInstance(event) });
          return;
        }
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
    formatDay(active?.date || event.date, locale) || (params.displayDate ?? "");
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

    // PAD-159, mirroring web's ClassDetailSheet: only worth checking when the
    // timing actually moved, and the class must not clash with itself — hence
    // excluding this event's own id.
    const timingChanged =
      draft.date !== instance.date ||
      draft.startTime !== instance.startTime ||
      draft.endTime !== instance.endTime;

    if (timingChanged) {
      const conflict = findOverlappingEvent(
        {
          date: draft.date,
          startTime: draft.startTime,
          endTime: draft.endTime,
        },
        dayEvents ?? [],
        event ? String(event.id) : undefined
      );
      if (conflict) {
        setOverlapOpen(true);
        return;
      }
    }

    proceedEdit();
  };

  /** The half of saveEdit that runs once any overlap has been acknowledged. */
  const proceedEdit = () => {
    setOverlapOpen(false);
    if (canApplyScope) {
      setEditScopeOpen(true);
    } else {
      void commitEdit("single");
    }
  };

  // PAD-150 (eligibility.enforcement rules 6, 7, 7d): a manual add that fails
  // the bar asks first, naming why. The edit is parked until answered.
  const [ineligible, setIneligible] = React.useState<EligibilityCheckEntry[]>([]);
  // PAD-131 (classes.join-requests): a student's ask / the coach's decision.
  const [joinBusy, setJoinBusy] = React.useState(false);
  const [pendingAccept, setPendingAccept] = React.useState<{
    id: number;
    ineligible: EligibilityCheckEntry[];
  } | null>(null);
  const [pendingEdit, setPendingEdit] = React.useState<{
    changes: Record<string, unknown>;
    scope: "single" | "future";
  } | null>(null);

  const finalizeEdit = async (changes: Record<string, unknown>, scope: "single" | "future") => {
    if (!event) return;
    setEditScopeOpen(false);
    setIsEditing(false);
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

  const commitEdit = async (scope: "single" | "future") => {
    if (!draft || !instance || !event) return;
    const changes = diffInstance(instance, draft, EDITABLE_CLASS_FIELDS) as Record<string, unknown>;
    if (Object.keys(changes).length === 0) {
      setEditScopeOpen(false);
      setIsEditing(false);
      setDraft(null);
      return;
    }
    const added = Array.isArray(changes.addPlayers) ? (changes.addPlayers as Array<string | number>) : [];
    if (added.length > 0) {
      try {
        const { ineligible: failing } = await notificationEngineApi.checkEligibility(
          event.model,
          String(event.originalId),
          event.date,
          added
        );
        if (failing.length > 0) {
          setEditScopeOpen(false);
          setIneligible(failing);
          setPendingEdit({ changes, scope });
          return;
        }
      } catch {
        // Rule 6: the warning is a courtesy, the enrolment is the coach's.
      }
    }
    await finalizeEdit(changes, scope);
  };

  // ── Remind ──
  const handleRemind = async () => {
    if (!event) return;
    try {
      const { sent, blocked } = await sendReminders.mutateAsync({
        model: event.model,
        originalId: String(event.originalId),
        date: event.date,
      });

      // PAD-170 C6: same reporting web's ClassDetailSheet does. `blocked` was
      // being discarded here, so "reminders sent to N" was the only thing the
      // coach saw even when nobody could be reached.
      const { unavailable, optedOut } = splitBlockedByCause(blocked);
      if (unavailable.length > 0) {
        toast.error(
          t("calendar.unavailable.blocked", {
            count: unavailable.length,
            names: blockedNames(unavailable),
          })
        );
      }
      if (optedOut.length > 0) {
        toast.error(
          t("calendar.notify.blockedByPreference", {
            names: blockedNames(optedOut),
          }),
          blockedReasons(optedOut) || undefined
        );
      }
      if (shouldReportSent(sent, blocked)) {
        toast.success(t("calendar.detail.remindersSent", { count: sent }));
      }
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
      const { approvalBundle: bundle } = await confirmPresences.mutateAsync({
        classInstance: instance,
        presences: payload,
      });
      // PAD-168: in semi-automatic mode the absences opened vacancies that
      // wait on the coach's approval. Web surfaces the bundle here (see
      // ClassDetailSheet's handleSaveAttendance); iOS dropped it, so the
      // invitations sat unapproved with nothing on screen saying so.
      setApprovalBundle(bundle ?? null);
      setFeedback(
        bundle
          ? t("calendar.detail.approvalNeededDescription")
          : t("calendar.detail.attendanceSavedTitle")
      );
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

  // PAD-131 (classes.join-requests rules 1, 4, 5, 7, 9) — mirrors web's
  // ClassDetailSheet: the student asks or withdraws; the coach accepts (a
  // manual add, so a student who slipped below the bar needs the same
  // named-reason confirmation) or rejects.
  const refreshInstance = async () => {
    if (!event) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.classInstance(event) });
  };
  const handleJoinRequest = async () => {
    if (!event) return;
    setJoinBusy(true);
    try {
      await classJoinRequestsApi.createClassJoinRequest({
        model: event.model,
        originalId: event.originalId,
        date: event.date,
      });
      toast.success(t("calendar.joinRequest.sentTitle"));
    } catch (err) {
      const refusal = classJoinRequestsApi.joinRequestRefusal(err);
      toast.error(
        refusal ? t(`calendar.joinRequest.refusal.${refusal.code}`) : t("calendar.joinRequest.failed")
      );
    } finally {
      await refreshInstance();
      setJoinBusy(false);
    }
  };
  const handleWithdrawJoinRequest = async (id: number) => {
    setJoinBusy(true);
    try {
      await classJoinRequestsApi.withdrawClassJoinRequest(id);
      toast.success(t("calendar.joinRequest.withdrawn"));
    } catch {
      toast.error(t("calendar.joinRequest.failed"));
    } finally {
      await refreshInstance();
      setJoinBusy(false);
    }
  };
  const handleDecideJoinRequest = async (id: number, accept: boolean, confirm = false) => {
    const req = instance?.joinRequests?.find((r) => r.id === id);
    setJoinBusy(true);
    try {
      if (accept) await classJoinRequestsApi.acceptClassJoinRequest(id, confirm);
      else await classJoinRequestsApi.rejectClassJoinRequest(id);
      toast.success(
        t(accept ? "calendar.joinRequest.acceptedToast" : "calendar.joinRequest.rejectedToast", {
          name: req?.playerName ?? "",
        })
      );
    } catch (err) {
      const refusal = classJoinRequestsApi.joinRequestRefusal(err);
      if (refusal?.code === "ineligible") {
        setJoinBusy(false);
        setPendingAccept({ id, ineligible: refusal.ineligible ?? [] });
        return;
      }
      toast.error(
        refusal?.code === "spot_filled"
          ? t("calendar.joinRequest.spotFilledToast")
          : refusal?.code === "class_closed"
            ? t("calendar.joinRequest.classClosedToast")
            : t("calendar.joinRequest.decideFailed")
      );
    } finally {
      await refreshInstance();
      setJoinBusy(false);
    }
  };

  // PAD-170 C5: the gates live in `attendance-decline.ts` so the unit runner can
  // exercise them. The proactive WINDOW is the server's answer
  // (`canDeclineProactively`), never re-derived here.
  const declineGate = {
    isCoach,
    isCanceled,
    ownPresence: myPresence,
    canDeclineProactively: instance?.canDeclineProactively,
    date: active?.date ?? event.date,
    startTime: active?.startTime ?? event.startTime,
  };
  const canCancel = canCancelAttendance(declineGate);
  const declined = hasDeclined(myPresence);
  const canDeclineEarly = canDeclineProactively(declineGate);

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

  // PAD-170 C5: the same endpoint as the plain cancel — the server classifies
  // which kind of decline it was (`attendance.confirm` rule 11), so this
  // handler never has to reason about the reminder cutoff itself. Only the copy
  // differs: freeing the spot early is a favour, not a cancellation.
  const handleProactiveDecline = async () => {
    setProactiveDeclineOpen(false);
    if (!myPresence) return;
    setFeedback(null);
    try {
      await cancelAttendance.mutateAsync(Number(myPresence.lessonInstanceId));
      toast.success(t("calendar.detail.proactiveDeclineDone"));
    } catch {
      toast.error(t("calendar.detail.proactiveDeclineFailed"));
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
                          date: formatDay(active.recurrenceEnd, locale),
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
                      date: formatDay(instance.recurrenceEnd, locale),
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

          {/* PAD-129: which eligibility tier applies, and the override editor in edit mode */}
          {isCoach && event?.type === "class" && active ? (
            <ClassEligibilityBlock
              current={active.eligibilityRules ?? null}
              effective={active.effectiveEligibilityRules ?? null}
              source={active.eligibilitySource ?? "coach"}
              editing={isEditing}
              onChange={(eligibilityRules) =>
                setDraft((d) => (d ? { ...d, eligibilityRules } : d))
              }
              openSpots={active.openSpotsVisible ?? null}
              effectiveOpenSpots={active.effectiveOpenSpotsVisible ?? false}
              openSpotsSource={active.openSpotsSource ?? "coach"}
              onOpenSpotsChange={(openSpotsVisible) =>
                setDraft((d) => (d ? { ...d, openSpotsVisible } : d))
              }
            />
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
              {t("calendar.detail.participantsCount", {
                label: t("calendar.detail.participants"),
                current: participants.length,
                max: maxPlayers || "—",
              })}
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

          {/* Replacement approval (semi-automatic mode, PAD-168) — mirrors
              web's ClassDetailSheet, which renders the same card between the
              attendance block and the Invited list. */}
          {isCoach && !isEditing && approvalBundle ? (
            <>
              <Separator />
              <ReplacementApprovalCard bundle={approvalBundle} />
            </>
          ) : null}

          {/* PAD-131 (rules 5, 7, 9): the coach decides each pending request. */}
          {isCoach && !isEditing && (instance?.joinRequests?.length ?? 0) > 0 ? (
            <>
              <Separator />
              <View className="gap-1" testID="class-join-requests">
                <Text className="py-1 text-sm font-semibold">
                  {t("calendar.joinRequest.coachTitle", { count: instance!.joinRequests!.length })}
                </Text>
                {instance!.joinRequests!.map((req) => (
                  <View
                    key={req.id}
                    className="flex-row items-center justify-between gap-2 py-1"
                    testID="class-join-request-row"
                  >
                    <Text className="flex-1 text-sm" numberOfLines={1}>
                      {req.playerName}
                    </Text>
                    <View className="flex-row gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={joinBusy}
                        onPress={() => void handleDecideJoinRequest(req.id, false)}
                        testID="class-join-reject"
                      >
                        <Text>{t("calendar.joinRequest.reject")}</Text>
                      </Button>
                      <Button
                        size="sm"
                        disabled={joinBusy}
                        onPress={() => void handleDecideJoinRequest(req.id, true)}
                        testID="class-join-accept"
                      >
                        <Text>{t("calendar.joinRequest.accept")}</Text>
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

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

          {/* PAD-131: a student outside the class asks for the open spot
              (rule 1) or withdraws their pending ask (rule 4). */}
          {!isCoach &&
          !isEditing &&
          !isCanceled &&
          !myPresence &&
          (event.openSpot || instance?.myJoinRequest) ? (
            <>
              <Separator />
              <View
                className="gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                testID="class-join-request"
              >
                {instance?.myJoinRequest?.status === "pending" ? (
                  <>
                    <Text className="text-sm font-medium">{t("calendar.joinRequest.pending")}</Text>
                    <Button
                      variant="outline"
                      disabled={joinBusy}
                      onPress={() => void handleWithdrawJoinRequest(instance!.myJoinRequest!.id)}
                      testID="class-join-withdraw"
                    >
                      <Text>{t("calendar.joinRequest.withdraw")}</Text>
                    </Button>
                  </>
                ) : (
                  <>
                    {instance?.myJoinRequest && instance.myJoinRequest.status !== "withdrawn" ? (
                      <Text className="text-xs text-muted-foreground">
                        {t(`calendar.joinRequest.${instance.myJoinRequest.status}`)}
                      </Text>
                    ) : null}
                    {event.openSpot ? (
                      <>
                        <Button
                          disabled={joinBusy}
                          onPress={() => void handleJoinRequest()}
                          testID="class-join-request-button"
                        >
                          <Text>{t("calendar.joinRequest.request")}</Text>
                        </Button>
                        <Text className="text-xs text-muted-foreground">
                          {event.coachName
                            ? t("calendar.joinRequest.requestHint", { coach: event.coachName })
                            : t("calendar.joinRequest.requestHintNoCoach")}
                        </Text>
                      </>
                    ) : null}
                  </>
                )}
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

                {/* PAD-170 C5 / `attendance.confirm` rule 16: once declined,
                    the student's own row says so in words, not just as a
                    status chip — and says the absence is justified, which is
                    the part that decides whether it counts against them. */}
                {declined ? (
                  <View
                    testID="class-not-attending"
                    className="flex-row items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                  >
                    <Ionicons
                      name="person-remove-outline"
                      size={16}
                      color={lightTheme.mutedForeground}
                    />
                    <View className="flex-1">
                      <Text className="text-sm font-medium">
                        {t("calendar.detail.notAttending")}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {t("calendar.detail.notAttendingJustified")}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* PAD-170 C5: freeing the spot EARLY is what gives the
                    invitation engine time to fill it, so it gets its own
                    affordance rather than hiding behind the cancel action —
                    and a hint saying why it is worth doing. */}
                {canDeclineEarly ? (
                  <View className="gap-1">
                    <Button
                      testID="class-proactive-decline"
                      accessibilityLabel={t("calendar.detail.proactiveDecline")}
                      variant="outline"
                      onPress={() => setProactiveDeclineOpen(true)}
                      disabled={cancelAttendance.isPending}
                    >
                      <Ionicons
                        name="person-remove-outline"
                        size={16}
                        color={lightTheme.mutedForeground}
                      />
                      <Text>{t("calendar.detail.proactiveDecline")}</Text>
                    </Button>
                    <Text className="text-xs text-muted-foreground">
                      {t("calendar.detail.proactiveDeclineHint")}
                    </Text>
                  </View>
                ) : null}

                {canCancel ? (
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

      <EligibilityConfirmDialog
        open={pendingEdit !== null}
        ineligible={ineligible}
        onCancel={() => {
          setPendingEdit(null);
          setIneligible([]);
        }}
        onConfirm={() => {
          const parked = pendingEdit;
          setPendingEdit(null);
          setIneligible([]);
          if (parked) void finalizeEdit(parked.changes, parked.scope);
        }}
      />
      {/* PAD-131 rule 7: accepting a request is a manual add — same warning. */}
      <EligibilityConfirmDialog
        open={pendingAccept !== null}
        ineligible={pendingAccept?.ineligible ?? []}
        onCancel={() => setPendingAccept(null)}
        onConfirm={() => {
          const parked = pendingAccept;
          setPendingAccept(null);
          if (parked) void handleDecideJoinRequest(parked.id, true, true);
        }}
      />
      <OverlapConfirmDialog
        open={overlapOpen}
        onCancel={() => setOverlapOpen(false)}
        onConfirm={proceedEdit}
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

      {/* PAD-170 C5: confirm a PROACTIVE decline. Deliberately different copy
          from the cancellation above — there is no deadline warning to give,
          because this happens before the student was ever asked, and the
          absence lands justified. */}
      <AlertDialog
        open={proactiveDeclineOpen}
        onOpenChange={setProactiveDeclineOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("calendar.detail.proactiveDeclineConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("calendar.detail.proactiveDeclineConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              testID="class-proactive-decline-confirm"
              accessibilityLabel={t("calendar.detail.proactiveDecline")}
              onPress={handleProactiveDecline}
              disabled={cancelAttendance.isPending}
            >
              <Text>{t("calendar.detail.proactiveDecline")}</Text>
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
