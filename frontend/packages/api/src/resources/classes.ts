import type { CalendarEvent, ClassInstance } from "@levelup/types";
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

export async function removeClass(
  event: CalendarEvent,
  scope: "single" | "future"
) {
  const res = await getApi().post(`/app/remove_class`, { event, scope });
  return res.data;
}

export async function editClass(
  event: CalendarEvent,
  updates: any,
  scope: "single" | "future"
) {
  const res = await getApi().post(`/app/edit_class`, { event, scope, updates });
  return res.data;
}
