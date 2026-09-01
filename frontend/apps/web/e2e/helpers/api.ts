/**
 * Where the E2E backend lives, for specs that call the API directly instead of
 * going through the app.
 *
 * These URLs must never be hardcoded. The backend port is overridable
 * (`E2E_BACKEND_PORT`, see playwright.config.ts) because 5001 is a popular port
 * and an unrelated local project holding it otherwise makes the suite
 * unrunnable. A spec with a literal `localhost:5001` in it does not follow the
 * override — it silently talks to whatever else is on 5001 and fails with a
 * confusing 404, which looks like a product bug and is not one.
 */
const PORT = process.env.E2E_BACKEND_PORT ?? "5001";

/** e.g. http://localhost:5001 */
export const BACKEND_ORIGIN = `http://localhost:${PORT}`;

/** e.g. http://localhost:5001/api */
export const API_ROOT = `${BACKEND_ORIGIN}/api`;

/** e.g. http://localhost:5001/api/app */
export const API_APP = `${API_ROOT}/app`;

/** e.g. http://localhost:5001/api/auth */
export const API_AUTH = `${API_ROOT}/auth`;
