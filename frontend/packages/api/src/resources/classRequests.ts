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

/** Rule 1: the coach's free blocks between two ISO datetimes. */
export async function getFreeBlocks(coachId: string, from: string, to: string): Promise<FreeBlock[]> {
  const res = await getApi().get("/app/class-requests/free-blocks", { params: { coachId, from, to } });
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

export async function acceptClassRequest(id: number): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/accept`);
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

/** Rule 5: the student answers the proposal. */
export async function answerClassRequestProposal(id: number, accept: boolean): Promise<ClassRequest> {
  const res = await getApi().post(`/app/class-requests/${id}/${accept ? "accept-proposal" : "decline-proposal"}`);
  return res.data;
}

export type ClassRequestRefusalCode =
  | "in_the_past"
  | "slot_taken"
  | "not_open"
  | "not_pending"
  | "not_countered"
  | "NO_CLUB";

/** The `409 {code, …}` body of a refused request/decision, or null. */
export function classRequestRefusal(err: unknown): { code: ClassRequestRefusalCode; message?: string } | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string") {
    return data as { code: ClassRequestRefusalCode; message?: string };
  }
  return null;
}
