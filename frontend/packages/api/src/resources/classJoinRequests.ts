import type { ClassJoinRequest, ClassJoinRequestListRow, EligibilityCheckEntry } from "@levelup/types";
import { getApi } from "../client";

/**
 * classes.join-requests rule 15 (PAD-131). Requests are addressed like a
 * class edit — by the calendar event — so a never-materialised recurrence
 * occurrence can be requested and the server materialises it.
 */
export async function createClassJoinRequest(event: {
  model: string;
  originalId: number | string;
  date?: string | null;
}, note?: string): Promise<ClassJoinRequest> {
  const res = await getApi().post("/app/class-join-requests", {
    model: event.model,
    originalId: event.originalId,
    date: event.date ?? null,
    // PAD-358: optional note to the coach; omitted when blank.
    ...(note && note.trim() ? { note: note.trim() } : {}),
  });
  return res.data;
}

/**
 * classes.join-requests rule 17 (PAD-460): the caller's academy join requests,
 * newest first, every status — a coach gets every request addressed to them, a
 * student gets their own.
 */
export async function listClassJoinRequests(): Promise<ClassJoinRequestListRow[]> {
  const res = await getApi().get("/app/class-join-requests");
  return res.data;
}

export async function withdrawClassJoinRequest(requestId: number): Promise<ClassJoinRequest> {
  const res = await getApi().post(`/app/class-join-requests/${requestId}/withdraw`);
  return res.data;
}

/** `confirm` overrides the named-reason eligibility warning (rule 7). */
export async function acceptClassJoinRequest(
  requestId: number,
  confirm = false
): Promise<ClassJoinRequest> {
  const res = await getApi().post(`/app/class-join-requests/${requestId}/accept`, { confirm });
  return res.data;
}

export async function rejectClassJoinRequest(requestId: number): Promise<ClassJoinRequest> {
  const res = await getApi().post(`/app/class-join-requests/${requestId}/reject`);
  return res.data;
}

export type JoinRequestRefusalCode =
  | "already_enrolled"
  | "class_closed"
  | "not_visible"
  | "spot_filled"
  | "ineligible"
  | "not_pending";

export interface JoinRequestRefusal {
  code: JoinRequestRefusalCode;
  message?: string;
  ineligible?: EligibilityCheckEntry[];
  request?: ClassJoinRequest;
}

/** The `409 {code, …}` body of a refused request/decision, or null. */
export function joinRequestRefusal(err: unknown): JoinRequestRefusal | null {
  const data = (err as { response?: { status?: number; data?: unknown } })?.response?.data;
  if (data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string") {
    return data as JoinRequestRefusal;
  }
  return null;
}
