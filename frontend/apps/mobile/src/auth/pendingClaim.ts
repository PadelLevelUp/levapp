/**
 * players.claim rule 3 — the player-invite link a signed-out visitor opened
 * and wants to LINK to an account they already have (not complete as new).
 *
 * Same shape and lifetime as `pendingJoin`: in memory for the life of the
 * process; login and signup consult it before routing.
 */
let pendingClaimToken: string | null = null;

export function rememberPendingClaim(token: string) {
  pendingClaimToken = token;
}

/** Read-and-clear. */
export function consumePendingClaim(): string | null {
  const token = pendingClaimToken;
  pendingClaimToken = null;
  return token;
}
