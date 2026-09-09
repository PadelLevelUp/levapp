/**
 * Per-checkout E2E isolation (PAD-218).
 *
 * Every checkout, worktree and session on this machine shares one Postgres
 * server. Until PAD-218, `npx playwright test` with no env defaulted to the
 * ONE database `levelup_test` and ports 5001/8080, and global-setup dropped
 * that database unconditionally — so starting a suite while another session's
 * suite was mid-run wiped its seed from under it.
 *
 * The defaults are now derived from the checkout path, so two worktrees never
 * share a database or a port unless told to. Explicit env always wins:
 *
 *   E2E_DB_NAME / E2E_BACKEND_PORT / E2E_WEB_PORT  — set any subset by hand
 *   E2E_SHARED=1                                   — opt back into
 *                                                    levelup_test / 5001 / 8080
 *                                                    (the single-session setup
 *                                                    `npm run test:e2e:reset`
 *                                                    also uses)
 *
 * Kept dependency-free and side-effect-free so playwright.config.ts,
 * global-setup.ts and a unit test can all import it.
 */
import { createHash } from "crypto";
import path from "path";

export const SHARED_DB_NAME = "levelup_test";
export const SHARED_BACKEND_PORT = "5001";
export const SHARED_WEB_PORT = "8080";

/* Derived ports live well away from the hand-picked 50xx/80xx conventions
   sessions already use, so a derived stack never collides with a manual one. */
const BACKEND_PORT_BASE = 5100;
const WEB_PORT_BASE = 8100;
const PORT_SPAN = 300;

export interface E2EIsolation {
  dbName: string;
  backendPort: string;
  webPort: string;
  /** "shared" = levelup_test/5001/8080, "env" = fully explicit, "derived" = per-checkout. */
  source: "shared" | "env" | "derived";
  /** Short id of the checkout the derived values came from. */
  checkoutId: string;
}

export function checkoutId(checkoutRoot: string): string {
  return createHash("sha1").update(path.resolve(checkoutRoot)).digest("hex").slice(0, 8);
}

export function resolveE2EIsolation(
  env: NodeJS.ProcessEnv,
  checkoutRoot: string
): E2EIsolation {
  const id = checkoutId(checkoutRoot);
  const explicit = {
    dbName: env.E2E_DB_NAME?.trim() || undefined,
    backendPort: env.E2E_BACKEND_PORT?.trim() || undefined,
    webPort: env.E2E_WEB_PORT?.trim() || undefined,
  };

  if (env.E2E_SHARED === "1") {
    return {
      dbName: explicit.dbName ?? SHARED_DB_NAME,
      backendPort: explicit.backendPort ?? SHARED_BACKEND_PORT,
      webPort: explicit.webPort ?? SHARED_WEB_PORT,
      source: "shared",
      checkoutId: id,
    };
  }

  const bucket = parseInt(id, 16) % PORT_SPAN;
  const allExplicit = explicit.dbName && explicit.backendPort && explicit.webPort;
  return {
    dbName: explicit.dbName ?? `levelup_e2e_${id}`,
    backendPort: explicit.backendPort ?? String(BACKEND_PORT_BASE + bucket),
    webPort: explicit.webPort ?? String(WEB_PORT_BASE + bucket),
    source: allExplicit ? "env" : "derived",
    checkoutId: id,
  };
}
