/**
 * Universal-link (iOS associated-domains) path parsing — PAD-184.
 *
 * Three web URLs must open the app instead of Safari:
 *   /invite/player/:token   — player completes their profile
 *   /invite/coach/:token    — coach joins a club
 *   /register/:userId?t=…   — newcomer activates an account (PAD-254: `t` is
 *                             the account's secret; the id alone is not a link)
 *
 * ## Why a pure module
 *
 * Expo Router already maps an incoming https URL onto a file route: on native it
 * strips the origin and treats the remainder as an in-app path (see
 * expo-router's `extractExactPathFromURL` — for `https?://` URLs the configured
 * `prefixes` are ignored entirely). So `https://levapp.app/invite/player/abc`
 * lands on `app/invite/player/[token].tsx` with no custom linking config.
 *
 * That makes the interesting logic — "is this path one of ours, and what is the
 * token" — a string function, and this module keeps it as one: no react-native,
 * no expo-router, no globals. The route files and the unit test both call it, so
 * what the test pins is what ships.
 *
 * ## Relationship to push-notification routing
 *
 * `usePushNotificationRouting` handles a different transport entirely
 * (`expo-notifications` response listeners → `router.push`) and only ever emits
 * `/conversation/:id` and `/class/:id`. There is no overlap with the paths here,
 * and neither mechanism intercepts the other's input: a universal link never
 * produces a notification response, and a notification tap never produces a URL.
 *
 * ## Fallback, not replacement
 *
 * Universal links do not fire from every context (some in-app browsers, some QR
 * scanners, a link pasted into Safari's address bar). Everything here is
 * additive: the same URL opened in a browser still reaches the web flow.
 */

/**
 * Hosts whose links the app claims, matching `ios.associatedDomains` in
 * app.json. `www.` is accepted here as an alias so a link generated against
 * `https://www.padellevelup.com` still parses — but note that Apple does NOT
 * treat `applinks:padellevelup.com` as covering `www.padellevelup.com`. If the
 * canonical public host becomes the www one, the entitlement needs its own
 * `applinks:www.padellevelup.com` entry and that host needs to serve the AASA
 * file too (see docs/infra/universal-links.md).
 */
export const UNIVERSAL_LINK_HOSTS = ["levapp.app", "padellevelup.com"] as const;

export type UniversalLinkTarget =
  | { kind: "player-invite"; token: string; path: string }
  | { kind: "coach-invite"; token: string; path: string }
  | { kind: "register"; userId: string; token: string | null; path: string };

/** `scheme://host/rest` — captures host and the remainder (path + anything after). */
const ABSOLUTE_URL_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^]*)$/i;

/** Strips optional `user:pass@` credentials and a `:port` suffix from an authority. */
function hostFromAuthority(authority: string): string {
  const withoutUserInfo = authority.slice(authority.lastIndexOf("@") + 1);
  // IPv6 literals are irrelevant here; a bare `host:port` split is enough.
  const host = withoutUserInfo.split(":")[0] ?? "";
  return host.toLowerCase();
}

function isClaimedHost(host: string): boolean {
  const bare = host.startsWith("www.") ? host.slice(4) : host;
  return (UNIVERSAL_LINK_HOSTS as readonly string[]).includes(bare);
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape (`%zz`) must not throw out of a link handler.
    return segment;
  }
}

/**
 * Parses an incoming link into one of the three known targets.
 *
 * Accepts a full URL (`https://levapp.app/invite/player/abc`), a rooted path
 * (`/invite/player/abc`) or a bare path (`invite/player/abc`) — Expo Router
 * hands over the last two shapes, iOS the first.
 *
 * Returns `null` for anything else: an unknown path, a claimed path with the
 * wrong number of segments, an empty/blank token, or an absolute URL pointing at
 * a host the app does not claim.
 */
export function parseUniversalLink(input: string): UniversalLinkTarget | null {
  if (typeof input !== "string") return null;

  let rest = input.trim();
  if (!rest) return null;

  const absolute = ABSOLUTE_URL_RE.exec(rest);
  if (absolute) {
    const host = hostFromAuthority(absolute[2] ?? "");
    if (!isClaimedHost(host)) return null;
    rest = absolute[3] ?? "";
  }

  // Drop the fragment first, then split off the query: the path decides the
  // route (`?next=/invite/...` must not be mistaken for one), and the only
  // query key with meaning is register's `t` — the activation secret.
  const withoutHash = rest.split("#")[0] ?? "";
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : withoutHash.slice(queryIndex + 1);

  const segments = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(safeDecode)
    .map((segment) => segment.trim());

  if (segments.some((segment) => segment.length === 0)) return null;

  if (segments.length === 3 && segments[0] === "invite") {
    const token = segments[2] as string;
    if (segments[1] === "player") {
      return { kind: "player-invite", token, path: playerInvitePath(token) };
    }
    if (segments[1] === "coach") {
      return { kind: "coach-invite", token, path: coachInvitePath(token) };
    }
    return null;
  }

  if (segments.length === 2 && segments[0] === "register") {
    const userId = segments[1] as string;
    const token = activationTokenFromQuery(query);
    return { kind: "register", userId, token, path: registerPath(userId, token) };
  }

  return null;
}

function playerInvitePath(token: string): string {
  return `/invite/player/${encodeURIComponent(token)}`;
}

function coachInvitePath(token: string): string {
  return `/invite/coach/${encodeURIComponent(token)}`;
}

function registerPath(userId: string, token: string | null): string {
  const base = `/register/${encodeURIComponent(userId)}`;
  return token ? `${base}?t=${encodeURIComponent(token)}` : base;
}

/** The `t` value of a query string, trimmed, or `null` when absent or blank. */
function activationTokenFromQuery(query: string): string | null {
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const key = safeDecode(eq === -1 ? pair : pair.slice(0, eq)).trim();
    if (key !== "t") continue;
    const value = safeDecode(eq === -1 ? "" : pair.slice(eq + 1)).trim();
    return value || null;
  }
  return null;
}

/**
 * The public web URL for a target — where the placeholder screens hand off until
 * PAD-164 builds the native versions, and the fallback the web flow keeps.
 *
 * `baseUrl` is passed in rather than read from `@/lib/config` so this module
 * stays free of `__DEV__` and of import side effects.
 */
export function webUrlForUniversalLink(
  target: UniversalLinkTarget,
  baseUrl: string
): string {
  return `${baseUrl.replace(/\/+$/, "")}${target.path}`;
}
