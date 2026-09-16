import { getApi } from "../client";

/* ---------- types ---------- */

export interface CoachClub {
  id: number;
  name: string;
}

export interface CreatedCoachInvitation {
  token: string;
  inviteLink: string; // e.g. "/invite/coach/<token>"
  expiresAt: string;
}

export interface PendingCoachInvitation {
  /** clubs.coach-invitation rule 7 (PAD-269): an id, never the token (only its hash is stored). */
  id: number;
  email: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface CoachInvitationInfo {
  clubName: string;
  status: string;
}

export interface AcceptCoachInvitationPayload {
  name: string;
  username: string;
  password: string;
}

export interface AcceptCoachInvitationResponse {
  accessToken: string;
}

/* ---------- coach / club ---------- */

export async function getCoachClub(): Promise<CoachClub | null> {
  const res = await getApi().get("/app/coach");
  return res.data?.club ?? null;
}

/* ---------- coach invitations ---------- */

export async function createCoachInvitation(
  clubId: number
): Promise<CreatedCoachInvitation> {
  const res = await getApi().post(`/app/club/${clubId}/coach-invitations`);
  return res.data;
}

export async function listCoachInvitations(
  clubId: number
): Promise<PendingCoachInvitation[]> {
  const res = await getApi().get(`/app/club/${clubId}/coach-invitations`);
  return res.data;
}

export async function getCoachInvitation(
  token: string
): Promise<CoachInvitationInfo> {
  const res = await getApi().get(`/app/coach-invitations/${token}`);
  return res.data;
}

export async function acceptCoachInvitation(
  token: string,
  payload: AcceptCoachInvitationPayload
): Promise<AcceptCoachInvitationResponse> {
  const res = await getApi().post(`/app/coach-invitations/${token}/accept`, payload);
  return res.data;
}

export async function revokeCoachInvitation(
  token: string
): Promise<{ success: boolean }> {
  const res = await getApi().post(`/app/coach-invitations/${token}/revoke`);
  return res.data;
}

/** Rule 7 (PAD-269): revoke a pending invitation from the club's list, by id. */
export async function revokeCoachInvitationById(
  clubId: number,
  invitationId: number
): Promise<{ success: boolean }> {
  const res = await getApi().post(`/app/club/${clubId}/coach-invitations/${invitationId}/revoke`);
  return res.data;
}
