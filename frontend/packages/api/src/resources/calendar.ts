import type { CalendarEvent } from "@levelup/types";
import { getApi } from "../client";

export async function addCalendarBlock(data: any): Promise<any> {
  const res = await getApi().post("/app/add_event", data);
  return res.data;
}

export async function getCalendarBlock(blockId: number): Promise<any> {
  const res = await getApi().get(`/app/calendar_block/${blockId}`);
  return res.data;
}

export async function editCalendarBlock(blockId: number, data: any): Promise<any> {
  const res = await getApi().put(`/app/calendar_block/${blockId}`, data);
  return res.data;
}

export async function deleteCalendarBlock(
  blockId: number,
  options?: { occDate?: string; scope?: 'single' | 'future' }
): Promise<void> {
  // PAD-160 / bug B-019: `{ data: undefined }` makes axios send no body AND no
  // `Content-Type`, and Flask's `request.get_json()` answers 415 for that — the
  // one-off (non-recurring) delete never reached the handler. Always send a JSON
  // object; `{}` is exactly what the backend already defaults to.
  await getApi().delete(`/app/calendar_block/${blockId}`, {
    data: options ?? {},
    headers: { "Content-Type": "application/json" },
  });
}

export async function rescheduleCalendarBlock(
  blockId: number,
  data: { occDate: string; newDate: string; newStartTime: string; newEndTime: string; scope: 'single' | 'future' }
): Promise<void> {
  await getApi().post(`/app/reschedule_block/${blockId}`, data);
}

export async function getCalendarEvents(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  const res = await getApi().get("/app/calendar", {
    params: { from, to },
  });
  return res.data;
}

export async function getCalendarEvent(
  event: CalendarEvent
): Promise<CalendarEvent> {
  const res = await getApi().get("/app/calendar_event", {
    params: {
      model: event.model,
      original_id: event.originalId,
    },
  });
  return res.data;
}
