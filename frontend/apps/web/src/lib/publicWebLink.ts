import { useQuery, type QueryClient } from "@tanstack/react-query";

import { getPublicWebOrigin } from "@levelup/api/src/resources/publicWebOrigin";

/**
 * PAD-595 step 1: every link and QR code a coach shares is built on this environment's public web
 * origin, served by the API (`PUBLIC_WEB_ORIGIN`), never on `window.location.origin` — the old
 * padellevelup.com domain still serves the app, so a coach browsing there handed out old-domain
 * links. The browser's own origin is only the fallback when the server has none configured, which
 * is also how the change is rolled back (unset or change the variable).
 */

export const PUBLIC_WEB_ORIGIN_KEY = ["public-web-origin"] as const;

/** `origin` + `path`, one slash between them; an already absolute `path` is returned unchanged. */
export function publicWebLink(origin: string, path: string): string {
  const p = (path ?? "").trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = (origin ?? "").trim().replace(/\/+$/, "");
  if (!p) return base;
  return `${base}/${p.replace(/^\/+/, "")}`;
}

function ownOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

const queryOptions = {
  queryKey: PUBLIC_WEB_ORIGIN_KEY,
  queryFn: getPublicWebOrigin,
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 1,
} as const;

/** The origin to build links on, or `null` while it is being read (render no link until then). */
export function usePublicWebOrigin(): string | null {
  const q = useQuery(queryOptions);
  if (q.isPending) return null;
  return q.data ?? ownOrigin(); // unset on the server, or the read failed: the browser's own
}

/** For links built in an event handler: reads (or reuses) the origin, then builds. */
export async function resolvePublicWebOrigin(queryClient: QueryClient): Promise<string> {
  try {
    return (await queryClient.fetchQuery(queryOptions)) ?? ownOrigin();
  } catch {
    return ownOrigin();
  }
}
