import "@/api/client";
import type { Court } from "@/types";
import * as courtsApi from "@levelup/api/src/resources/courts";
import { getCoachClub } from "@levelup/api/src/resources/invitations";
import { USE_MOCK_DATA } from "@/config";

/**
 * clubs.courts (PAD-194): a club's courts. Thin wrapper over the shared
 * resource with the web-only mock switch, plus the one convenience the class
 * forms need — the courts of the coach's CURRENT club.
 */

export const listCourts = (clubId: number) => (USE_MOCK_DATA ? Promise.resolve([] as Court[]) : courtsApi.listCourts(clubId));
export const createCourt = courtsApi.createCourt;
export const renameCourt = courtsApi.renameCourt;
export const deleteCourt = courtsApi.deleteCourt;
export const reorderCourts = courtsApi.reorderCourts;

/** The courts of the coach's current club, or [] when they have no club. */
export async function listCurrentClubCourts(): Promise<Court[]> {
  if (USE_MOCK_DATA) return [];
  const club = await getCoachClub();
  return club ? courtsApi.listCourts(club.id) : [];
}
