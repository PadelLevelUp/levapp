import type { CalendarEvent, ClassInstance } from "@/types";
import { api } from "@/api/client";

const API_URL = import.meta.env.VITE_API_URL;

//TODO: Check if this makes sense
export async function getClassInstances(
  from: string,
  to: string,
): Promise<ClassInstance[]> {

  const res = await api.post(
    `${API_URL}/api/app/lesson_instances?from=${from}&to=${to}`
  );
  return res.data;
}

export async function getClassInstance(
  event: CalendarEvent
): Promise<ClassInstance> {
  const res = await api.post(
    `${API_URL}/api/app/class_instance?model=${event.model}&id=${event.originalId}`
  );

  const instanceData = await res.data;

  return {
    id: event.id,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status!,
    color: event.color,
    classType: event.classType,
    maxPlayers: event.maxPlayers!,
    ...instanceData,
  };
}


export async function addClass(data: any) {
  const res = await api.post(`${API_URL}/api/app/add_class`, JSON.stringify(data));
  return res.data;
}

export async function removeClass(
  event: CalendarEvent,
  scope: 'single' | 'future'
) {
  const res = await api.post(`${API_URL}/api/app/remove_class`,JSON.stringify({
    event,
    scope,
  }));
  return res.data;
}

export async function editClass(
  event: CalendarEvent,
  updates: any,
  scope: 'single' | 'future'
) {
  const res = await api.post(`${API_URL}/api/app/edit_class`, JSON.stringify({
    event,
    scope,
    updates,
  }));

  return res.data;
}
