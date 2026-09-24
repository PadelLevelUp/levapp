/**
 * The logout sequence (PAD-418, B-167; messaging.push-notifications rule 9).
 *
 * `/auth/logout` blocklists the access token, so the push-token DELETE must
 * reach the server BEFORE the session is revoked: a DELETE sent after it is
 * refused, the token stays registered to this account, and the phone keeps
 * receiving this account's pushes after someone else signs in. The unregister
 * is therefore awaited first — bounded, so a dead network or a hung permission
 * lookup never holds logout — and only then is the session revoked and the
 * stored token cleared. The revoke is bounded too (the API client has no
 * timeout), and it carries the push token so the server can drop the row in
 * the same authenticated request (auth.logout rule 4) — the unregister above is
 * then only the fallback. Every step is best-effort: logout always completes.
 */
export const PUSH_UNREGISTER_TIMEOUT_MS = 3000;
/** The API client has no timeout; a blackholed /auth/logout must not hold logout either. */
export const REVOKE_TIMEOUT_MS = 5000;

function bounded(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function signOut(deps: {
  unregisterPush: () => Promise<void>;
  revokeSession: () => Promise<void>;
  clearToken: () => Promise<void>;
  unregisterTimeoutMs?: number;
  revokeTimeoutMs?: number;
}): Promise<void> {
  await bounded(deps.unregisterPush(), deps.unregisterTimeoutMs ?? PUSH_UNREGISTER_TIMEOUT_MS);
  await bounded(deps.revokeSession(), deps.revokeTimeoutMs ?? REVOKE_TIMEOUT_MS);
  await deps.clearToken().catch(() => undefined);
}
