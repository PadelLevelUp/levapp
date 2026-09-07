/**
 * players.join-token rule 9 — a visitor who opens a join link without a
 * session is sent to sign in / sign up and must come back to that link.
 *
 * sessionStorage, not localStorage: the intent belongs to this tab and this
 * visit. Only in-app paths are accepted, so nothing can turn this into an
 * open redirect.
 */
const KEY = "postAuthRedirect";

export function rememberPostAuthRedirect(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* private mode / storage blocked — the user simply lands on the default */
  }
}

/** Read-and-clear. Returns null when nothing was remembered. */
export function consumePostAuthRedirect(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
  } catch {
    return null;
  }
}
