/**
 * PAD-920 (classes.join-requests NJ1–NJ2): every refusal code of a join request or a waiting-list
 * join has a line under `calendar.joinRequest.refusal.<code>`, the same on both shells. A code this
 * build does not know (a newer server) reads the generic "could not send" line, never a raw key.
 */
export const JOIN_REFUSAL_CODES = [
  "already_enrolled",
  "class_closed",
  "not_visible",
  "spot_filled",
  "ineligible",
  "not_pending",
  // PAD-920: the new engine's direct join, and the waiting-list join while the class has room.
  "side_full",
  "busy_same_hour",
  "has_spots",
] as const;

export type KnownJoinRefusalCode = (typeof JOIN_REFUSAL_CODES)[number];

const KNOWN = new Set<string>(JOIN_REFUSAL_CODES);

export function joinRefusalKey(code: string | null | undefined): string {
  return code && KNOWN.has(code) ? `calendar.joinRequest.refusal.${code}` : "calendar.joinRequest.failed";
}

/** The refusal body of an axios-style 409, if any: `{code, requestedSide?, openSides?}`. */
export function joinRefusalOf(err: unknown): { code: string; requestedSide?: string | null; openSides?: string[] } | null {
  if (typeof err !== "object" || err === null) return null;
  const response = (err as { response?: { status?: unknown; data?: unknown } }).response;
  if (!response || response.status !== 409) return null;
  const data = response.data as { code?: unknown } | null;
  if (!data || typeof data.code !== "string") return null;
  return data as { code: string; requestedSide?: string | null; openSides?: string[] };
}
