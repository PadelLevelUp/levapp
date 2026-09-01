/**
 * Base URLs for the E2E test backend.
 *
 * The port is overridable via `E2E_BACKEND_PORT` (default 5001, matching
 * `playwright.config.ts`). Several unrelated Flask apps on this machine also
 * default to 5001, and `reuseExistingServer: false` means a collision fails the
 * whole suite rather than silently talking to the wrong app's database — the
 * safe failure, but still a hard stop. Set the env var on both the run and the
 * config and the suite steps around the squatter:
 *
 *   E2E_BACKEND_PORT=5055 npx playwright test
 *
 * Specs should import from here rather than hardcoding the URL, so the port
 * lives in exactly one place.
 */
const PORT = process.env.E2E_BACKEND_PORT ?? "5001";

export const API_ROOT = `http://localhost:${PORT}/api`;
export const API_BASE = `${API_ROOT}/app`;
export const AUTH_BASE = `${API_ROOT}/auth`;
