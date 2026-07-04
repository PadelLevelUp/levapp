import { api } from "@/api/client";

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
}

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
  const res = await api.get("/app/availability_blockers");
  return res.data;
}

export async function createBlocker(
  data: BlockerInput
): Promise<AvailabilityBlocker> {
  const res = await api.post("/app/availability_blockers", data);
  return res.data;
}

export async function updateBlocker(
  id: number,
  data: BlockerInput
): Promise<AvailabilityBlocker> {
  const res = await api.put(`/app/availability_blockers/${id}`, data);
  return res.data;
}

export async function deleteBlocker(id: number): Promise<void> {
  await api.delete(`/app/availability_blockers/${id}`, {
    data: { scope: "all" },
  });
}
