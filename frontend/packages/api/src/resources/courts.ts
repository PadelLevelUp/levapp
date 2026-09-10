import type { Court } from "@levelup/types";
import { getApi } from "../client";

/**
 * A club's courts (spec `clubs.courts`, PAD-194 v1). Both shells consume this
 * module; neither talks to axios directly (R-012). Every route is scoped to
 * the club's coaches server-side (rule 1).
 */

export async function listCourts(clubId: number): Promise<Court[]> {
  const res = await getApi().get<Court[]>(`/app/club/${clubId}/courts`);
  return res.data;
}

export async function createCourt(clubId: number, name: string): Promise<Court> {
  const res = await getApi().post<Court>(`/app/club/${clubId}/courts`, { name });
  return res.data;
}

export async function renameCourt(courtId: number, name: string): Promise<Court> {
  const res = await getApi().patch<Court>(`/app/courts/${courtId}`, { name });
  return res.data;
}

export async function deleteCourt(courtId: number): Promise<void> {
  await getApi().delete(`/app/courts/${courtId}`);
}

export async function reorderCourts(clubId: number, ids: number[]): Promise<Court[]> {
  const res = await getApi().put<Court[]>(`/app/club/${clubId}/courts/order`, { ids });
  return res.data;
}
