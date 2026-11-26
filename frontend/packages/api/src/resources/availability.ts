import type { CoveredClass, DeclineCoveredBody, DeclineCoveredResult } from "@levelup/types";
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

/** A block as the save routes answer it: PAD-772 adds the classes it covers (absent on an older server). */
export type SavedBlocker = AvailabilityBlocker & { coveredClasses?: CoveredClass[] };

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

/**
 * PAD-772 (calendar.student-blockers rule 19): the classes saving this schedule would newly cover, read
 * before the PUT (which answers a bare list). Writes nothing.
 */
export async function readScheduleCoveredClasses(scheduleId: string, data: ScheduleInput): Promise<CoveredClass[]> {
  const res = await getApi().post(`/app/availability_schedules/${encodeURIComponent(scheduleId)}/covered_classes`, data);
  return res.data.coveredClasses ?? [];
}

/** PAD-772 (rule 22): the student's yes — the server re-checks each class and declines the ones that still hold. */
export async function declineCoveredClasses(body: DeclineCoveredBody): Promise<DeclineCoveredResult> {
  const res = await getApi().post("/app/availability_blockers/decline_covered", body);
  return res.data;
}

/** Remove every row of the schedule `scheduleId`. */
export async function deleteSchedule(scheduleId: string): Promise<void> {
  await getApi().delete(`/app/availability_schedules/${encodeURIComponent(scheduleId)}`);
}
