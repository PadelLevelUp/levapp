import { getApi } from "../client";
import { invalidateCoachPlayersCache } from "./players";

/* ---------- types (players.join-token) ---------- */

/** The coach's active join token — rule 1/2. `path` is relative; clients build the URL. */
export interface CoachJoinToken {
  token: string;
  /** e.g. "/join/coach/<token>" */
  path: string;
  /** Absolute URL when the server knows the web origin; clients prefer `path`. */
  url?: string;
  expiresAt: string;
  clubName: string;
}

/** Public preview of a token — rule 4: enough to see who you are joining. */
export interface JoinTokenPreview {
  coachName: string;
  clubName: string;
  clubLogoUrl: string | null;
}

/** Rule 5: idempotent accept. */
export interface AcceptJoinTokenResponse {
  joined: boolean;
  alreadyMember: boolean;
  coachName: string;
  clubName: string;
}

/* ---------- coach side ---------- */

/** Rule 1: mint (or rotate) the coach's join token. 409 NO_CLUB without a club. */
export async function mintJoinToken(): Promise<CoachJoinToken> {
  const res = await getApi().post("/app/coach/join-token");
  return res.data;
}

/** Rule 2: the active, unexpired token or null. */
export async function getJoinToken(): Promise<CoachJoinToken | null> {
  const res = await getApi().get("/app/coach/join-token");
  return res.data ?? null;
}

/* ---------- student side ---------- */

/** Rule 4: public preview. 404 unknown, 410 retired/expired. */
export async function previewJoinToken(token: string): Promise<JoinTokenPreview> {
  const res = await getApi().get(`/app/join-tokens/${token}`);
  return res.data;
}

/** Rule 5: the acting player comes from the JWT; nothing goes in the body. */
export async function acceptJoinToken(token: string): Promise<AcceptJoinTokenResponse> {
  const res = await getApi().post(`/app/join-tokens/${token}/accept`);
  // The coach's roster changed under them — drop the 60 s roster cache.
  invalidateCoachPlayersCache();
  return res.data;
}

/** The path segment a join link carries, or null when the input is not one. */
export function joinTokenFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/join\/coach\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  // A bare token pasted on its own.
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return trimmed;
  return null;
}
