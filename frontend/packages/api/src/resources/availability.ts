import type { MarkedClass } from "@levelup/types";
import { getApi } from "../client";

// PAD-28: Student availability blockers. A blocker suppresses AUTOMATIC class
// invitations during a window the student is unavailable. Backed by the shared
// CalendarBlock model (type="unavailable", blocksAutoInvitations=true).

export interface AvailabilityBlocker {
  id: number;
  userId: number;
  type: string;
  title: string | null;
  description: string | null;
  isRecurring: boolean;
  recurrenceRule: { frequency: string; daysOfWeek: number[] } | null;
  recurrenceEnd: string | null;
  blocksAutoInvitations: boolean;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  /**
   * PAD-839 (calendar.student-blockers rule 18): the schedule this row belongs to, or null for a
   * block made any other way. Absent on an older backend.
   */
  scheduleId?: string | null;
}

/** A block as the save routes answer it: PAD-772 adds the classes the save marked "Não vai" (absent on an older server). */
export type SavedBlocker = AvailabilityBlocker & { markedClasses?: MarkedClass[] };

export interface BlockerInput {
  title?: string | null;
  description?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurrenceRule?: { frequency: string; daysOfWeek: number[] } | null;
  endDate?: string | null;
}

export async function listBlockers(): Promise<AvailabilityBlocker[]> {
  const res = await getApi().get("/app/availability_blockers");
  return res.data;
}

export async function createBlocker(
  data: BlockerInput
): Promise<SavedBlocker> {
  const res = await getApi().post("/app/availability_blockers", data);
  return res.data;
}

export async function updateBlocker(
  id: number,
  data: BlockerInput
): Promise<SavedBlocker> {
  const res = await getApi().put(`/app/availability_blockers/${id}`, data);
  return res.data;
}

export async function deleteBlocker(id: number): Promise<void> {
  await getApi().delete(`/app/availability_blockers/${id}`, {
    data: { scope: "all" },
  });
}

/** PAD-839: a schedule's rows, written whole (calendar.student-blockers rule 18). */
export interface ScheduleInput {
  title: string | null;
  blockers: BlockerInput[];
}

/** Replace (or create) the schedule `scheduleId`; answers the rows written. All rows or none. */
export async function putSchedule(
  scheduleId: string,
  data: ScheduleInput
): Promise<AvailabilityBlocker[]> {
  const res = await getApi().put(`/app/availability_schedules/${encodeURIComponent(scheduleId)}`, data);
  return res.data;
}

/** Remove every row of the schedule `scheduleId`. */
export async function deleteSchedule(scheduleId: string): Promise<void> {
  await getApi().delete(`/app/availability_schedules/${encodeURIComponent(scheduleId)}`);
}
