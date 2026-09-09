import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* The E2E backend port. Overridable because 5001 is a popular port — an
   unrelated local project holding it makes the whole suite fail to start, and
   `reuseExistingServer: false` means Playwright can't just adopt whatever is
   there (it would be the wrong app, or the wrong database). */
const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? "5001";
/* The E2E database and Vite port are overridable for the same reason: several
   checkouts (worktrees, other sessions) share one Postgres server and one
   machine. Running two suites against `levelup_test` at once resets the
   database under the other run. Use e.g. E2E_DB_NAME=levelup_test_pad210
   E2E_BACKEND_PORT=5011 E2E_WEB_PORT=8090 — and pass the same E2E_DB_NAME to
   e2e/scripts/reset-test-db.sh. */
const DB_NAME = process.env.E2E_DB_NAME ?? "levelup_test";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "8080";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",

  /* Serial execution to avoid DB conflicts */
  workers: 1,
  fullyParallel: false,

  /* Retry once on CI */
  retries: process.env.CI ? 1 : 0,

  /* Long timeout for scheduler tests */
  timeout: 3 * 60 * 1000,

  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    /* NOTE: `reducedMotion: "reduce"` does NOT belong here. Verified on
       Playwright 1.62.1 in this project: setting it in `use` (config- or
       file-level) leaves `matchMedia("(prefers-reduced-motion: reduce)")`
       false in the page, while `page.emulateMedia()` sets it correctly. An
       inert option that reads as if it works is worse than none, so the login
       helper calls emulateMedia instead — see e2e/helpers/auth.ts. */
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Start Flask backend with test DB */
  webServer: [
    {
      command: `bash -c 'source .venv/bin/activate && flask run --host 127.0.0.1 --port ${BACKEND_PORT} --no-reload'`,
      cwd: path.resolve(__dirname, "../../../backend"),
      url: `http://127.0.0.1:${BACKEND_PORT}/api/app/healthz`,
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        FLASK_APP: "padel_app",
        FLASK_ENV: "development",
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5432",
        POSTGRES_USER: "padel_app_user",
        POSTGRES_PW: process.env.POSTGRES_PW ?? "",
        POSTGRES_DB: DB_NAME,
        JWT_SECRET_KEY: "e2e-test-secret",
        E2E_DEBUG_ENDPOINTS: "true",
        TEST_MODE: "true",
        // PAD-228: the suite signs in from 127.0.0.1 far more often than any
        // person; the throttle is covered by pytest, not here.
        AUTH_RATE_LIMIT_ENABLED: "0",
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT}`,
      cwd: __dirname,
      port: Number(WEB_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_BACKEND_PORT: BACKEND_PORT,
      },
    },
  ],
});
