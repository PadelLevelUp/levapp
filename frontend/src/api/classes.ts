import type { CalendarEvent, ClassInstance } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

//TODO: Check if this makes sense
export async function getClassInstances(
  from: string,
  to: string,
  user_id: number
): Promise<ClassInstance[]> {

  const res = await fetch(
    `${API_URL}/api/app/lesson_instances?from=${from}&to=${to}&user_id=${user_id}`
  );
  return res.json();
}

export async function getClassInstance(
  event: CalendarEvent
): Promise<ClassInstance> {
  const res = await fetch(
    `${API_URL}/api/app/class_instance?model=${event.model}&id=${event.originalId}`
  );

  const instanceData = await res.json();

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
  const res = await fetch(`${API_URL}/api/app/add_class`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error('Failed to create class');
  }

  return res.json();
}