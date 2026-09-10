/**
 * Absolute links into the web app (PAD-165).
 *
 * Mobile has no `window.location` to resolve a relative path against, so every
 * link the coach is handed — a player invite link returned by the API, the
 * self-registration link for a player who has no account yet — has to be
 * prefixed with the configured public web origin before it is shareable.
 *
 * That prefixing used to live inline in `app/player/new.tsx` and existed
 * exactly once, at player creation. Pulling it out here is what lets the
 * player-detail screen hand out the same kind of link at any time.
 *
 * **Pure on purpose.** The base URL is a parameter rather than an import of
 * `@/lib/config`: that module reads `__DEV__` and `process.env` at module
 * scope, neither of which exists in the mobile vitest environment (no Metro,
 * no RN runtime). Callers pass `WEB_APP_URL`; the rules below stay testable.
 */

/**
 * Join a base origin and a path into one absolute URL.
 *
 * - A path that is already absolute (`http://`, `https://`) is returned as-is,
 *   so a backend that starts returning absolute invite links does not produce
 *   `https://web.example/https://web.example/invite/...`.
 * - Exactly one slash ends up between the two halves, whichever side supplied
 *   it. `WEB_APP_URL` is configured without a trailing slash today and the API
 *   returns `"/invite/player/<token>"` with a leading one, but an override via
 *   `EXPO_PUBLIC_WEB_URL` is a plain env var and can arrive either way.
 */
export function webAppLink(baseUrl: string, path: string): string {
  const trimmedPath = path.trim();
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;

  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmedPath) return base;
  return `${base}/${trimmedPath.replace(/^\/+/, "")}`;
}

/**
 * The self-registration link for a coach-created player who has not activated
 * an account yet — web's `/register/:userId` route (`auth.activate` rule 3).
 *
 * Mirrors web's `PlayerHeader`, including its `"player"` placeholder for a
 * missing id: the route still renders, and its own lookup is what tells the
 * visitor the link is not valid. Silently producing `/register/undefined`
 * would be worse.
 */
export function registerLink(
  baseUrl: string,
  userId: string | number | null | undefined,
  token?: string | null
): string {
  const id = userId === null || userId === undefined ? "" : String(userId).trim();
  const secret = (token ?? "").trim();
  // auth.activate rule 2 (PAD-254): the link carries the account's secret.
  // Without one the bare route is still produced — it renders and reports
  // itself invalid, which beats handing the coach nothing.
  const query = id && secret ? `?t=${encodeURIComponent(secret)}` : "";
  return webAppLink(baseUrl, `/register/${id || "player"}${query}`);
}
