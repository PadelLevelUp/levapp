import type { CalendarEvent, ClassInstance } from "@levelup/types";
import { getApi } from "../client";

export async function getClassInstances(
  from: string,
  to: string
): Promise<ClassInstance[]> {
  const res = await getApi().post(
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
