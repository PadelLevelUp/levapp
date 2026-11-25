import type { CalendarEvent, ClassInstance, CloneTemplate } from "@levelup/types";
import { getApi } from "../client";

/**
 * Despite the name, this hits `/app/lesson_instances`, which returns
 * CalendarEvent-serialized rows (padel_app/serializers/calendar_event.py
 * `serialize_calendar_event` — same helper the main calendar-events endpoint
 * uses), not full `ClassInstance` objects: `title` not `name`,
 * `participantCount` not a `participants` array, plus `model`/`originalId`.
 * Was mistyped as `ClassInstance[]` for a while (see found_issues.md) —
 * fixed to match what the backend actually sends.
 */
export async function getClassInstances(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  // PAD-80: this route is registered GET-only (`@bp.get("/lesson_instances")`).
  // It used to be POSTed, which 405'd — the only caller is the player profile's
  // "Add to classes" picker, so that dialog always rendered its empty state and
  // no class was ever offered.
  const res = await getApi().get(
    `/app/lesson_instances?from=${from}&to=${to}`
  );
  return res.data;
}

export async function getClassInstance(
  event: CalendarEvent
): Promise<ClassInstance> {
  const res = await getApi().post(
    `/app/class_instance?model=${event.model}&id=${event.originalId}&date=${event.date}`
  );

  const instanceData = await res.data;

  return {
    id: event.id,
    originalId: String(event.originalId),
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status!,
    color: event.color,
    classType: event.classType,
    maxPlayers: event.maxPlayers!,
    coachId: "",
    ...instanceData,
  };
}

export async function addClass(data: any) {
  const res = await getApi().post(`/app/add_class`, data);
  return res.data;
}

/** classes.delete rule 9 (PAD-840): why the class is cancelled, and whether the students are told why. */
export interface CancelReason {
  reason?: string;
  sendReason?: boolean;
  /** Rule 13 (phase 2): the coach's edited message for this cancellation, with its placeholders. */
  messageOverride?: string;
}

export async function removeClass(
  event: CalendarEvent,
  scope: "single" | "future",
  cancel?: CancelReason
) {
  const res = await getApi().post(`/app/remove_class`, { event, scope, ...cancel });
  return res.data;
}

/**
 * classes.delete rule 12 (PAD-840): the message the first student would get, rendered by the server,
 * and how many students would be told.
 */
export async function previewClassCancellation(
  event: CalendarEvent,
  cancel: CancelReason
): Promise<{ text: string; recipients: number; template?: string }> {
  const res = await getApi().post(`/app/class_cancellation_preview`, { event, scope: "single", ...cancel });
  return res.data;
}

/** classes.delete rule 14 (PAD-840): one kept cancellation of a class. */
export interface ClassCancellation {
  date: string;
  scope: "single" | "future";
  reason: string;
  sentToStudents: boolean;
}

export async function getClassCancellations(lessonId: string): Promise<ClassCancellation[]> {
  const res = await getApi().get(`/app/class/${lessonId}/cancellations`);
  return res.data.cancellations;
}

export async function editClass(
  event: CalendarEvent,
  updates: any,
  scope: "single" | "future"
) {
  const res = await getApi().post(`/app/edit_class`, { event, scope, updates });
  return res.data;
}

/**
 * PAD-326 (`calendar.event-detail` rule 15): fetch one materialised occurrence
 * by its id, for a route that carries only that — a push, a universal link, the
 * `lessonInstanceId` a message already has. JWT'd and role-filtered server-side
 * (a student sees only their own presence).
 *
 * A 404 here is meaningful and permanent: the instance is gone. Callers must
 * distinguish it from a transient failure rather than offering a Retry that
 * cannot succeed.
 */
export async function getLessonInstanceById(instanceId: number): Promise<{
  lessonInstance: {
    id: number;
    lessonId?: number;
    date: string;
    startTime?: string;
    endTime?: string;
    status?: string;
    name?: string | null;
    color?: string | null;
    maxPlayers?: number | null;
  };
}> {
  const res = await getApi().get(`/app/lesson_instance/${instanceId}`);
  return res.data;
}

/** classes.clone (PAD-524): the prefill for "Clonar aula", derived on the server from the series. */
export async function getCloneTemplate(event: {
  model: string;
  originalId: string | number;
  date: string;
}): Promise<CloneTemplate> {
  const res = await getApi().get(`/app/class_instance/clone_template`, {
    params: { model: event.model, id: event.originalId, date: event.date },
  });
  return res.data;
}

