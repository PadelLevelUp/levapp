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

/** players.claim rule 4b (PAD-528): one of the coach's own students who could be the placeholder's real account. */
export interface ClaimCandidate {
  playerId: string | number;
  name: string;
  levelLabel: string | null;
  /** Same normalised name as the placeholder — listed first. */
  sameName: boolean;
}

/**
 * players.claim rule 5j (PAD-528): the merge's plan, by table. `moves` will point at the
 * student afterwards; `dropped` are placeholder rows discarded because the student already
 * has the same fact for the same occasion; `merged` join an existing record or thread.
 */
export interface MergePreview {
  moves: Record<string, number>;
  dropped: Record<string, number>;
  merged: Record<string, number>;
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

/** Rule 4b (PAD-528): the coach picks the student from their own roster instead of typing a username. */
export async function createClaimRequestByPick(
  playerId: string | number,
  targetPlayerId: string | number
): Promise<PlayerClaimRequest> {
  const res = await getApi().post(`/app/player/${playerId}/claim-requests`, { targetPlayerId });
  invalidateCoachPlayersCache();
  return res.data;
}

/** Rule 4b (PAD-528): the coach's students who could be this placeholder's account, namesakes first. */
export async function listClaimCandidates(
  playerId: string | number,
  search?: string
): Promise<ClaimCandidate[]> {
  const res = await getApi().get(`/app/player/${playerId}/claim-candidates`, {
    params: search ? { search } : undefined,
  });
  return res.data;
}

/** Rule 5j (PAD-528): the coach's dry run before sending the request. */
export async function previewMergeForCoach(
  playerId: string | number,
  targetPlayerId: string | number
): Promise<MergePreview> {
  const res = await getApi().get(`/app/player/${playerId}/merge-preview`, { params: { targetPlayerId } });
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

/** Rule 5j (PAD-528): the student's dry run of a pending request before accepting. */
export async function previewClaimRequest(id: string | number): Promise<MergePreview> {
  const res = await getApi().get(`/app/player-claim-requests/${id}/preview`);
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
