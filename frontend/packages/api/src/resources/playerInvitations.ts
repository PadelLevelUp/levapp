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
