import "@/api/client";
import type { CalendarEvent, ClassInstance } from "@/types";
import * as classesApi from "@levelup/api/src/resources/classes";
import { USE_MOCK_DATA } from "@/config";
import { mockClassInstances } from "@/data/mockData";

export async function getClassInstances(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  if (USE_MOCK_DATA) {
    // mockClassInstances is still ClassInstance-shaped (name/participants) —
    // never retrofitted to match the real endpoint's CalendarEvent shape.
    // VITE_USE_MOCK_DATA=false in .env, so this branch doesn't run in
    // practice; cast rather than reshaping mockData.ts for a dead path.
    return mockClassInstances.filter(
      (c) => c.date >= from && c.date <= to
    ) as unknown as CalendarEvent[];
  }

  return classesApi.getClassInstances(from, to);
}

export async function getClassInstance(
  event: CalendarEvent
): Promise<ClassInstance> {
  if (USE_MOCK_DATA) {
    const instance = mockClassInstances.find((c) => event.id === `class-${c.id}`);
    if (instance) return instance;
  }

  return classesApi.getClassInstance(event);
}

export async function addClass(data: any) {
  if (USE_MOCK_DATA) {
    console.log("[mock] addClass", data);
    return { id: crypto.randomUUID(), ...data };
  }

  return classesApi.addClass(data);
}

export async function removeClass(
  event: CalendarEvent,
  scope: "single" | "future"
) {
  if (USE_MOCK_DATA) {
    console.log("[mock] removeClass", event.id, scope);
    return { success: true };
  }

  return classesApi.removeClass(event, scope);
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

  return classesApi.editClass(event, updates, scope);
}
