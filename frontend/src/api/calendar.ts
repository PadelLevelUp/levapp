import type { CalendarEvent } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import { mockCalendarEvents } from "@/data/mockData";

export async function addCalendarBlock(data: any): Promise<any> {
  const res = await api.post("/app/add_event", data);
  return res.data;
}

export async function getCalendarBlock(blockId: number): Promise<any> {
  const res = await api.get(`/app/calendar_block/${blockId}`);
  return res.data;
}

export async function editCalendarBlock(blockId: number, data: any): Promise<any> {
  const res = await api.put(`/app/calendar_block/${blockId}`, data);
  return res.data;
}

export async function deleteCalendarBlock(
  blockId: number,
  options?: { occDate?: string; scope?: 'single' | 'future' }
): Promise<void> {
  await api.delete(`/app/calendar_block/${blockId}`, { data: options });
}

export async function rescheduleCalendarBlock(
  blockId: number,
  data: { occDate: string; newDate: string; newStartTime: string; newEndTime: string; scope: 'single' | 'future' }
): Promise<void> {
  await api.post(`/app/reschedule_block/${blockId}`, data);
}

export async function getCalendarEvents(
  from: string,
  to: string
): Promise<CalendarEvent[]> {
  if (USE_MOCK_DATA) {
    return mockCalendarEvents.filter(
      (e) => e.date >= from && e.date <= to
    );
  }

  const res = await api.get("/app/calendar", {
    params: { from, to },
  });
  return res.data;
}

export async function getCalendarEvent(
  event: CalendarEvent
): Promise<CalendarEvent> {
  if (USE_MOCK_DATA) {
    const found = mockCalendarEvents.find((e) => e.id === event.id);
    return found ?? event;
  }

  const res = await api.get("/app/calendar_event", {
    params: {
      model: event.model,
      original_id: event.originalId,
    },
  });
  return res.data;
}
