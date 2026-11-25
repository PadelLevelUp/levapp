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
  /** PAD-642 (players.create rule 10): the coach confirms the student is 18 or older. */
  confirmsAdults?: boolean;
}

export interface AcceptPlayerInvitationPayload {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  /** PAD-457 (players.invite-completion rule 10): `YYYY-MM-DD`, required; under 18 is refused. */
  birthDate?: string;
  /** PAD-604: ISO 3166-1 alpha-2, required by clients that declare `country-on-completion`. */
  country?: string;
  /** PAD-637 (auth.register rule 19b): the Terms checkbox. Required by clients that declare
   * `terms-on-completion`. */
  termsAccepted?: boolean;
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
