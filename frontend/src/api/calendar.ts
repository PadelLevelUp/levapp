import type { CalendarEvent } from "@/types";

const API_URL = import.meta.env.VITE_API_URL;

export async function getCalendarEvents(
  from: string,
  to: string,
  user_id: number
): Promise<CalendarEvent[]> {
  const res = await fetch(
    `${API_URL}/api/app/calendar?from=${from}&to=${to}&user_id=${user_id}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}


export async function getCalendarEvent(
  event: CalendarEvent
): Promise<CalendarEvent[]> {
  const res = await fetch(
    `${API_URL}/api/app/calendar_event?model=${event.model}&original_d=${event.originalId}`,
    {
      credentials: "include",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}
