import type { ClassRequest, FreeBlock } from "@levelup/types";
import { getApi } from "../client";

/** classes.class-requests (PAD-104) — a student books a class in the coach's free time. */

export interface ClassRequestCoach {
  id: string;
  name: string;
}

export interface ClassRequestSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export async function listClassRequests(): Promise<ClassRequest[]> {
  const res = await getApi().get("/app/class-requests");
  return res.data;
}

/** Rule 2: the coaches the student is rostered with. */
export async function listClassRequestCoaches(): Promise<ClassRequestCoach[]> {
  const res = await getApi().get("/app/class-requests/coaches");
  return res.data;
}

/** Rule 1: the coach's free blocks between two ISO datetimes. Rule 10: pass the
 * student's own request id to leave its hold out of the busy time. */
export async function getFreeBlocks(coachId: string, from: string, to: string, excludeRequestId?: number): Promise<FreeBlock[]> {
  const params: Record<string, string | number> = { coachId, from, to };
  if (excludeRequestId != null) params.excludeRequestId = excludeRequestId;
  const res = await getApi().get("/app/class-requests/free-blocks", { params });
  return res.data;
}

export async function createClassRequest(
  data: ClassRequestSlot & { coachId: string; note?: string | null }
): Promise<ClassRequest> {
  const res = await getApi().post("/app/class-requests", data);
  return res.data;
}

export async function withdrawClassRequest(id: number): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/withdraw`);
  return res.data;
}

/** Rule 5: `slot` is the slot the caller is looking at; the server refuses (409 slot_changed)
 * when it is no longer the one on the table, so a stale bubble never books an unseen time. */
export async function acceptClassRequest(id: number, slot?: ClassRequestSlot): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/accept`, slot ? { slot } : {});
  return res.data;
}

export async function declineClassRequest(id: number): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/decline`);
  return res.data;
}

/** Rule 4: the coach proposes another slot; the request turns `countered`. */
export async function proposeClassRequest(id: number, slot: ClassRequestSlot): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/propose`, slot);
  return res.data;
}

/** Rule 5: the student answers the proposal; `slot` is the one they are looking at (see acceptClassRequest). */
export async function answerClassRequestProposal(id: number, accept: boolean, slot?: ClassRequestSlot): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/${accept ? "accept-proposal" : "decline-proposal"}`, slot ? { slot } : {});
  return res.data;
}

/** Rule 10 (PAD-281): the student proposes another time; the request is `pending` again. */
export async function counterProposeClassRequest(id: number, slot: ClassRequestSlot): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/counter-proposal`, slot);
  return res.data;
}

export type ClassRequestRefusalCode =
  | "in_the_past"
  | "slot_taken"
  | "not_open"
  | "not_pending"
  | "not_countered"
  | "slot_changed"
  | "NO_CLUB";

/** The `409 {code, …}` body of a refused request/decision, or null. */
export function classRequestRefusal(err: unknown): { code: ClassRequestRefusalCode; message?: string } | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string") {
    return data as { code: ClassRequestRefusalCode; message?: string };
  }
  return null;
}
