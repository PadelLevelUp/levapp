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
  await getApi().delete(`/app/calendar_block/${blockId}`, { data: options });
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
