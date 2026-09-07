import { getApi } from "../client";
import { invalidateCoachPlayersCache } from "./players";

/* ---------- types (players.claim, PAD-213) ---------- */

export type PlayerClaimRequestStatus = "pending" | "accepted" | "rejected" | "revoked";

/**
 * Trigger B — a coach asks a student, by exact username, to take over the
 * placeholder record the coach created for them.
 */
export interface PlayerClaimRequest {
  id: string;
  playerId: string;
  /** The name the coach typed when creating the record. */
  placeholderName: string;
  coachId: string;
  coachName: string;
  clubName: string | null;
  status: PlayerClaimRequestStatus;
  createdAt: string;
}

/* ---------- coach side ---------- */

/**
 * Rule 4: coach → "Link to existing account". 404 when no active student has
 * that username; 409 when a request is already pending or the record was
 * activated (ALREADY_ACTIVATED); 403 when the caller is not that player's coach.
 */
export async function createClaimRequest(
  playerId: string | number,
  username: string
): Promise<PlayerClaimRequest> {
  const res = await getApi().post(`/app/player/${playerId}/claim-requests`, { username });
  invalidateCoachPlayersCache();
  return res.data;
}

/** Rule 4: the requesting coach withdraws a still-pending request (410 otherwise). */
export async function revokeClaimRequest(id: string | number): Promise<PlayerClaimRequest> {
  const res = await getApi().post(`/app/player-claim-requests/${id}/revoke`);
  invalidateCoachPlayersCache();
  return res.data;
}

/* ---------- student side ---------- */

/** Rule 4: the signed-in student's own pending requests. */
export async function listMyClaimRequests(): Promise<PlayerClaimRequest[]> {
  const res = await getApi().get("/app/player-claim-requests");
  return res.data;
}

/** Rule 4/5: accept — the merge runs and the placeholder disappears. */
export async function acceptClaimRequest(id: string | number): Promise<PlayerClaimRequest> {
  const res = await getApi().post(`/app/player-claim-requests/${id}/accept`);
  invalidateCoachPlayersCache();
  return res.data;
}

/** Rule 4: reject — both records stay exactly as they were. */
export async function rejectClaimRequest(id: string | number): Promise<PlayerClaimRequest> {
  const res = await getApi().post(`/app/player-claim-requests/${id}/reject`);
  return res.data;
}
