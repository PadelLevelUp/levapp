/**
 * players.join-token rule 9 — the join link a signed-out visitor opened.
 *
 * Kept in memory for the life of the process: the universal link brought the
 * app to the foreground, the visitor signs in or signs up, and login/signup
 * consult this before routing. Nothing to persist; a cold relaunch simply
 * re-opens the link from the camera.
 */
let pendingJoinToken: string | null = null;

export function rememberPendingJoin(token: string) {
  pendingJoinToken = token;
}

/** Read-and-clear. */
export function consumePendingJoin(): string | null {
  const token = pendingJoinToken;
  pendingJoinToken = null;
  return token;
}
