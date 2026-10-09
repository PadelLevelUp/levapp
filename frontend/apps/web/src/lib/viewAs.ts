// admin.approvals-and-users rule 9 (PAD-532): "view as", read-only.
// A staff operator opens /view-as#<token> from the staff console. The token is kept for THIS
// TAB only (sessionStorage) and takes precedence over the normal session (localStorage), which
// is never read, written or cleared while it is present. The backend refuses every write and
// every messaging read under it and never refreshes it; this module only stores and discards.

export const VIEW_AS_TOKEN_KEY = "levapp-view-as-token";

function store(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function getViewAsToken(): string | null {
  return store()?.getItem(VIEW_AS_TOKEN_KEY) ?? null;
}

export function isViewingAs(): boolean {
  return getViewAsToken() !== null;
}

export function startViewAs(token: string): void {
  store()?.setItem(VIEW_AS_TOKEN_KEY, token);
}

export function endViewAs(): void {
  store()?.removeItem(VIEW_AS_TOKEN_KEY);
}

/** The token carried in a `/view-as#<token>` URL fragment, or null. */
export function tokenFromFragment(hash: string): string | null {
  const token = (hash || "").replace(/^#/, "").trim();
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
}
