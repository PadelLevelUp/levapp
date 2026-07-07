import {
  classesApi,
  notificationEngineApi,
  presencesApi,
} from "@levelup/api";
import type {
  AbsenceJustification,
  CalendarEvent,
  ClassInstance,
  PresenceStatus,
} from "@levelup/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
