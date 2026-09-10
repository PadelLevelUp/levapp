import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { resolveE2EIsolation } from "./e2e/isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* PAD-218: the database and both ports are per-checkout by default, derived
   from this directory's path (see e2e/isolation.ts), so two worktrees can run
   their suites at once without resetting each other's database or fighting
   over 5001/8080. Explicit E2E_DB_NAME / E2E_BACKEND_PORT / E2E_WEB_PORT still
   win; E2E_SHARED=1 opts back into levelup_test / 5001 / 8080. global-setup
   passes the same values to e2e/scripts/reset-test-db.sh. */
const ISOLATION = resolveE2EIsolation(process.env, __dirname);
const BACKEND_PORT = ISOLATION.backendPort;
const DB_NAME = ISOLATION.dbName;
const WEB_PORT = ISOLATION.webPort;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

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
