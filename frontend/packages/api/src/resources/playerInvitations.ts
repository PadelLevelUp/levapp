import { getApi } from "../client";
import { invalidateCoachPlayersCache } from "./players";

/* ---------- types ---------- */

export interface CreatedPlayerInvitation {
  token: string;
  inviteLink: string; // e.g. "/invite/player/<token>"
  expiresAt: string;
}

export interface PlayerInvitationInfo {
  playerName: string;
  status: string;
}

export interface CreateIncompletePlayerPayload {
  coachId?: number | string;
  name: string;
  levelId?: string;
  side?: string;
  notes?: string;
  email?: string;
}

export interface AcceptPlayerInvitationPayload {
  username: string;
  password: string;
  email?: string;
  phone?: string;
}

export interface AcceptPlayerInvitationResponse {
  accessToken: string;
}

/** players.claim trigger A — the signed-in student took the record over. */
export interface ClaimPlayerInvitationResponse {
  merged: boolean;
  coachName: string;
}

/* ---------- player invitations ---------- */

export async function createIncompletePlayer(
  payload: CreateIncompletePlayerPayload
): Promise<CreatedPlayerInvitation> {
  const res = await getApi().post("/app/incomplete_player", payload);
  invalidateCoachPlayersCache();
  return res.data;
}

export async function getPlayerInvitation(
  token: string
): Promise<PlayerInvitationInfo> {
  const res = await getApi().get(`/app/player-invitations/${token}`);
  return res.data;
}

export async function acceptPlayerInvitation(
  token: string,
  payload: AcceptPlayerInvitationPayload
): Promise<AcceptPlayerInvitationResponse> {
  const res = await getApi().post(`/app/player-invitations/${token}/accept`, payload);
  return res.data;
}

/**
 * players.claim rule 3 (trigger A): a signed-in student links the coach-created
 * record behind this invitation to their own account. 403 for a coach account,
 * 409 ALREADY_ACTIVATED, 404/410 exactly like accept.
 */
export async function claimPlayerInvitation(
  token: string
): Promise<ClaimPlayerInvitationResponse> {
  const res = await getApi().post(`/app/player-invitations/${token}/claim`);
  invalidateCoachPlayersCache();
  return res.data;
}
