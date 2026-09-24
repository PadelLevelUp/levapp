/**
 * The logout sequence (PAD-418, B-167; messaging.push-notifications rule 9).
 *
 * `/auth/logout` blocklists the access token, so the push-token DELETE must
 * reach the server BEFORE the session is revoked: a DELETE sent after it is
 * refused, the token stays registered to this account, and the phone keeps
 * receiving this account's pushes after someone else signs in. The unregister
 * is therefore awaited first — bounded, so a dead network or a hung permission
 * lookup never holds logout — and only then is the session revoked and the
 * stored token cleared. Every step is best-effort: logout always completes.
 */
export const PUSH_UNREGISTER_TIMEOUT_MS = 3000;

export async function signOut(deps: {
  unregisterPush: () => Promise<void>;
  revokeSession: () => Promise<void>;
  clearToken: () => Promise<void>;
  unregisterTimeoutMs?: number;
}): Promise<void> {
  const timeoutMs = deps.unregisterTimeoutMs ?? PUSH_UNREGISTER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    deps.unregisterPush().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  await deps.revokeSession().catch(() => undefined);
  await deps.clearToken().catch(() => undefined);
}
