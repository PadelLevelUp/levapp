import { getApi } from "../client";
import { getCoachClub } from "./invitations";

/**
 * clubs.crud + clubs.join-request (PAD-211): an approved coach with no club
 * creates one or asks to join an existing one; a member of that club decides.
 * Every call here is `require_coach()` server-side — a pending coach gets
 * 403 `{error: "COACH_NOT_APPROVED"}`; the client only chooses what to show.
 */

export interface ClubSearchResult {
  id: number;
  name: string;
  location: string | null;
  logoUrl: string | null;
}

export interface CreatedClub {
  id: number;
  name: string;
  location: string | null;
}

export type ClubJoinRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export interface ClubJoinRequest {
  id: number;
  clubId: number;
  clubName: string;
  coachId: number;
  coachName: string;
  status: ClubJoinRequestStatus;
  requestedAt: string;
}

/** clubs.join-request rule 1: name search, min 2 chars, never members. */
export async function searchClubs(query: string): Promise<ClubSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await getApi().get("/app/clubs/search", { params: { q } });
  return res.data;
}

/** clubs.crud: create a club; the caller becomes its (first) member. */
export async function createClub(payload: {
  name: string;
  location?: string;
}): Promise<CreatedClub> {
  const res = await getApi().post("/app/club", {
    name: payload.name,
    ...(payload.location ? { location: payload.location } : {}),
  });
  return res.data;
}

/** clubs.join-request rule 2: ask to join; 409 if already a member or pending. */
export async function createClubJoinRequest(clubId: number): Promise<ClubJoinRequest> {
  const res = await getApi().post(`/app/club/${clubId}/join-requests`);
  return res.data;
}

/** clubs.join-request rule 3: pending requests for a club — members only. */
export async function listClubJoinRequests(clubId: number): Promise<ClubJoinRequest[]> {
  const res = await getApi().get(`/app/club/${clubId}/join-requests`);
  return res.data;
}

/**
 * Pending requests for the caller's current club, or `[]` when the coach has
 * no club yet. Convenience for the Settings badge and the Club section, which
 * both start from "which club am I in".
 */
export async function listMyClubJoinRequests(): Promise<ClubJoinRequest[]> {
  const club = await getCoachClub();
  if (!club) return [];
  return listClubJoinRequests(club.id);
}

export async function approveClubJoinRequest(requestId: number): Promise<ClubJoinRequest> {
  const res = await getApi().post(`/app/club-join-requests/${requestId}/approve`);
  return res.data;
}

export async function rejectClubJoinRequest(requestId: number): Promise<ClubJoinRequest> {
  const res = await getApi().post(`/app/club-join-requests/${requestId}/reject`);
  return res.data;
}

/** clubs.join-request rule 5: the requesting coach takes it back. */
export async function withdrawClubJoinRequest(requestId: number): Promise<ClubJoinRequest> {
  const res = await getApi().post(`/app/club-join-requests/${requestId}/withdraw`);
  return res.data;
}
