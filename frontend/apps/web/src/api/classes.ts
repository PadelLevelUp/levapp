import type { CalendarEvent, ClassInstance } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockClassInstances, mockCalendarEvents } from "@/data/mockData";

export async function getClassInstances(
  from: string,
  to: string
): Promise<ClassInstance[]> {
  if (USE_MOCK_DATA) {
    return mockClassInstances.filter(
      (c) => c.date >= from && c.date <= to
    );
  }

  const res = await api.post(
    `/app/lesson_instances?from=${from}&to=${to}`
  );
  return res.data;
}

export async function getClassInstance(
  event: CalendarEvent
): Promise<ClassInstance> {
  if (USE_MOCK_DATA) {
    const instance = mockClassInstances.find((c) => event.id === `class-${c.id}`);
    if (instance) return instance;
  }

  const res = await api.post(
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
  if (USE_MOCK_DATA) {
    console.log("[mock] addClass", data);
    return { id: crypto.randomUUID(), ...data };
  }

  const res = await api.post(`/app/add_class`, data);
  return res.data;
}

export async function removeClass(
  event: CalendarEvent,
  scope: "single" | "future"
) {
  if (USE_MOCK_DATA) {
    console.log("[mock] removeClass", event.id, scope);
    return { success: true };
  }

  const res = await api.post(`/app/remove_class`, { event, scope });
  return res.data;
}

export async function editClass(
  event: CalendarEvent,
  updates: any,
  scope: "single" | "future"
) {
  if (USE_MOCK_DATA) {
    console.log("[mock] editClass", event.id, updates, scope);
    return { success: true };
  }

  const res = await api.post(`/app/edit_class`, { event, scope, updates });
  return res.data;
}
