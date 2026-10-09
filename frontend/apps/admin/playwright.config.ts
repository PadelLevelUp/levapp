import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { resolveE2EIsolation } from "../web/e2e/isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* admin.phone-console rule 7 (PAD-572). Modelled on apps/web/playwright.config.ts: the database
   and the backend port are the web app's for this checkout (PAD-218 isolation, derived from the
   web app's directory so both suites agree), so the console and the product never fight over a
   second database. The console is served by Vite on its own port: E2E_ADMIN_PORT, else the web
   port + 1000 (9100-9400, away from 8090 and the web range), else 8090 when E2E_SHARED=1.
   Run through `npm run test:e2e`: it resets the database BEFORE Playwright boots the backend
   (e2e/scripts/reset-db.sh); globalSetup only seeds. */
const ISOLATION = resolveE2EIsolation(process.env, path.resolve(__dirname, "../web"));
const BACKEND_PORT = ISOLATION.backendPort;
const DB_NAME = ISOLATION.dbName;
const ADMIN_PORT =
  process.env.E2E_ADMIN_PORT?.trim() ||
  (process.env.E2E_SHARED === "1" ? "8090" : String(Number(ISOLATION.webPort) + 1000));

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",

  /* One seeded database, serial execution */
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60 * 1000,

  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: `http://localhost:${ADMIN_PORT}`,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "iphone-13",
      // The descriptor's viewport, UA and touch, emulated in Chromium (its default is WebKit,
      // which the CI lane does not install; the web suite is Chromium-only too).
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],

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
        AUTH_RATE_LIMIT_ENABLED: "0",
        // The console's own gate: it answers only on these hosts, and sign-in needs a client id.
        ADMIN_HOSTS: "localhost,127.0.0.1",
        ADMIN_GOOGLE_CLIENT_ID: "e2e-admin-client-id",
        ADMIN_CONSOLE_URL: `http://localhost:${ADMIN_PORT}`,
      },
    },
    {
      command: `npm run dev -- --port ${ADMIN_PORT}`,
      cwd: __dirname,
      port: Number(ADMIN_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_BACKEND_PORT: BACKEND_PORT,
      },
    },
  ],
});
