import {
  calendarApi,
  classesApi,
  notificationEngineApi,
  presencesApi,
  trainingApi,
} from "@levelup/api";
import type {
  AbsenceJustification,
  CalendarEvent,
  ClassInstance,
  PresenceStatus,
} from "@levelup/types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Every query a class mutation can affect. */
const CLASS_DATA_KEYS: QueryKey[] = [
  ["calendar-events"],
  ["class-instance"],
  ["dashboard"],
];

/**
 * PAD-202: answering a reminder marks it read (notifications.reminders rule
 * 13), so the Messages tab badge and the conversation list refetch as well.
 * Only the reminder answer touches read state, so only it invalidates these.
 */
const REMINDER_ANSWER_KEYS: QueryKey[] = [["messages-unread-count"], ["conversations"]];

/** The key `useCalendarBlock` caches one calendar block under. */
export function calendarBlockQueryKey(blockId: number | null): QueryKey {
  return ["calendar-block", blockId];
}

/**
 * Every query a calendar-block (non-class event) mutation can affect (PAD-160).
 *
 * `CLASS_DATA_KEYS` alone is not enough: the event-detail screen renders from
 * `["calendar-block", blockId]`, so leaving that entry cached made a successful
 * save snap the screen back to the pre-edit title/description — the mutation
 * had landed, but the view was reading a stale block.
 */
export function eventMutationInvalidationKeys(blockId: number): QueryKey[] {
  return [...CLASS_DATA_KEYS, calendarBlockQueryKey(blockId)];
}

function invalidateKeys(queryClient: QueryClient, keys: QueryKey[]) {
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * The `onSuccess` an event mutation runs, as a plain function of the query
 * client — extracted from the hooks so the unit runner can exercise the real
 * invalidation instead of a restatement of it.
 */
export function eventMutationOnSuccess(queryClient: QueryClient) {
  return (_data: unknown, variables: { blockId: number }) =>
    invalidateKeys(queryClient, eventMutationInvalidationKeys(variables.blockId));
}

/** Invalidates every query a class mutation can affect. */
function useInvalidateClassData() {
  const queryClient = useQueryClient();
  return () => invalidateKeys(queryClient, CLASS_DATA_KEYS);
}

export function useAddClass() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => classesApi.addClass(data),
    onSuccess: invalidate,
  });
}

/** Personal/break/holiday/off-work calendar block (web's AddEventSheet parity). */
export function useAddEvent() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      calendarApi.addCalendarBlock(data),
    onSuccess: invalidate,
  });
}

/** One calendar block, for the event-detail screen (PAD-160). */
export function useCalendarBlock(blockId: number | null) {
  return useQuery({
    queryKey: calendarBlockQueryKey(blockId),
    queryFn: () => calendarApi.getCalendarBlock(blockId as number),
    enabled: blockId != null && Number.isFinite(blockId),
  });
}

/**
 * Edit a calendar block (PAD-160). Web's EventDetailSheet does this inline;
 * iOS routes it through a hook so the same invalidation runs as for classes.
 */
export function useEditEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      blockId,
      data,
    }: {
      blockId: number;
      data: Record<string, unknown>;
    }) => calendarApi.editCalendarBlock(blockId, data),
    onSuccess: eventMutationOnSuccess(queryClient),
  });
}

/**
 * Delete a calendar block (PAD-160).
 *
 * `scope` is only sent for a recurring block, matching web: the backend reads
 * the occurrence date alongside it to decide between this one and all future.
 */
export function useRemoveEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      blockId,
      occDate,
      scope,
    }: {
      blockId: number;
      occDate?: string;
      scope?: "single" | "future";
    }) =>
      calendarApi.deleteCalendarBlock(
        blockId,
        scope ? { occDate: occDate ?? "", scope } : undefined
      ),
    onSuccess: eventMutationOnSuccess(queryClient),
  });
}

export function useRemoveClass() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      event,
      scope,
    }: {
      event: CalendarEvent;
      scope: "single" | "future";
    }) => classesApi.removeClass(event, scope),
    onSuccess: invalidate,
  });
}

export function useEditClass() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      event,
      updates,
      scope,
    }: {
      event: CalendarEvent;
      updates: Record<string, unknown>;
      scope: "single" | "future";
    }) => classesApi.editClass(event, updates, scope),
    onSuccess: invalidate,
  });
}

/** Coach action: nudge unconfirmed participants (POST /app/notify/send_reminders). */
export function useSendClassReminders() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      model,
      originalId,
      date,
    }: {
      model: string;
      originalId: string;
      date: string;
    }) => notificationEngineApi.sendClassReminders(model, originalId, date),
    onSuccess: invalidate,
  });
}

/** Coach action: invite specific players outside auto-invitation (POST /app/notify/manual). */
export function useSendManualNotifications() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      model,
      originalId,
      date,
      playerIds,
    }: {
      model: string;
      originalId: string;
      date: string;
      playerIds: string[];
    }) =>
      notificationEngineApi.sendManualNotifications(
        model,
        originalId,
        date,
        playerIds
      ),
    onSuccess: invalidate,
  });
}

/** Groups/players eligible for manual notification on a class instance —
 * feeds the notify picker (mirrors web's ManualNotificationModal). */
export function useNotificationGroups(
  model: string | null | undefined,
  originalId: string | null | undefined,
  date: string | null | undefined
) {
  return useQuery({
    queryKey: ["notification-groups", model, originalId, date],
    queryFn: () =>
      notificationEngineApi.getNotificationGroups(
        model as string,
        originalId as string,
        date as string
      ),
    enabled: !!model && !!originalId && !!date,
  });
}

/** Coach action: save the confirmed exercise plan for a class instance. */
export function useConfirmClassTraining() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      classInstance,
      exerciseIds,
    }: {
      classInstance: ClassInstance;
      exerciseIds: string[];
    }) => trainingApi.confirmClassTraining(classInstance, exerciseIds),
    onSuccess: invalidate,
  });
}

export type AttendancePayloadItem = {
  playerId: string;
  status: PresenceStatus;
  justification?: AbsenceJustification;
};

export function useConfirmPresences() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      classInstance,
      presences,
    }: {
      classInstance: ClassInstance;
      presences: AttendancePayloadItem[];
    }) => presencesApi.confirmClassPresences(classInstance, presences),
    onSuccess: invalidate,
  });
}

/** Student action: give up a confirmed spot (POST /app/notify/cancel_attendance). */
export function useCancelAttendance() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: (lessonInstanceId: number) =>
      notificationEngineApi.cancelAttendance(lessonInstanceId),
    onSuccess: invalidate,
  });
}

/** Student action: answer a class reminder (POST /app/notify/respond_reminder). */
export function useRespondReminder() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      lessonInstanceId,
      action,
    }: {
      lessonInstanceId: number;
      action: "yes" | "no";
    }) => notificationEngineApi.respondToReminder(lessonInstanceId, action),
    onSuccess: () => {
      invalidate();
      invalidateKeys(queryClient, REMINDER_ANSWER_KEYS);
    },
  });
}
