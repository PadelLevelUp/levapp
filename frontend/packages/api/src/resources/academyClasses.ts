import type { AcademyClassesResponse } from "@levelup/types";
import { getApi } from "../client";

/**
 * classes.academy-class-booking rule 9 (PAD-358): the "Marcar Aula" wizard's
 * academy step. Requests go through `classJoinRequestsApi.createClassJoinRequest`
 * (with a note); a full class's waiting list is joined here.
 */
export async function listAcademyClasses(coachId: string | number): Promise<AcademyClassesResponse> {
  const res = await getApi().get("/app/academy-classes", { params: { coachId } });
  return res.data;
}

export interface WaitingListPlace {
  lessonInstanceId: number;
  onWaitingList: boolean;
}

/** The student's own place on a full class's waiting list; addressed by the calendar event. */
export async function joinClassWaitingList(event: {
  model: string;
  originalId: number | string;
  date?: string | null;
}): Promise<WaitingListPlace> {
  const res = await getApi().post("/app/class-waiting-list", {
    model: event.model,
    originalId: event.originalId,
    date: event.date ?? null,
  });
  return res.data;
}

export async function leaveClassWaitingList(lessonInstanceId: number): Promise<WaitingListPlace> {
  const res = await getApi().post(`/app/class-waiting-list/${lessonInstanceId}/leave`);
  return res.data;
}

export type WaitingListRefusalCode =
  | "already_enrolled"
  | "class_closed"
  | "not_visible"
  | "ineligible"
  | "has_spots";
