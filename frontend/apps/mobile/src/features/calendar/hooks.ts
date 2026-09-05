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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Invalidates every query a class mutation can affect. */
function useInvalidateClassData() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    void queryClient.invalidateQueries({ queryKey: ["class-instance"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
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
    queryKey: ["calendar-block", blockId],
    queryFn: () => calendarApi.getCalendarBlock(blockId as number),
    enabled: blockId != null && Number.isFinite(blockId),
  });
}

/**
 * Edit a calendar block (PAD-160). Web's EventDetailSheet does this inline;
 * iOS routes it through a hook so the same invalidation runs as for classes.
 */
export function useEditEvent() {
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      blockId,
      data,
    }: {
      blockId: number;
      data: Record<string, unknown>;
    }) => calendarApi.editCalendarBlock(blockId, data),
    onSuccess: invalidate,
  });
}

/**
 * Delete a calendar block (PAD-160).
 *
 * `scope` is only sent for a recurring block, matching web: the backend reads
 * the occurrence date alongside it to decide between this one and all future.
 */
export function useRemoveEvent() {
  const invalidate = useInvalidateClassData();
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
    onSuccess: invalidate,
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
  const invalidate = useInvalidateClassData();
  return useMutation({
    mutationFn: ({
      lessonInstanceId,
      action,
    }: {
      lessonInstanceId: number;
      action: "yes" | "no";
    }) => notificationEngineApi.respondToReminder(lessonInstanceId, action),
    onSuccess: invalidate,
  });
}
