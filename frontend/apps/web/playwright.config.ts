import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    baseURL: "http://localhost:8080",
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
      command: "bash -c 'source .venv/bin/activate && flask run --host 127.0.0.1 --port 5001 --no-reload'",
      cwd: path.resolve(__dirname, "../../../levelup_backend"),
      url: "http://127.0.0.1:5001/api/app/healthz",
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        FLASK_APP: "padel_app",
        FLASK_ENV: "development",
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5432",
        POSTGRES_USER: "padel_app_user",
        POSTGRES_PW: process.env.POSTGRES_PW ?? "",
        POSTGRES_DB: "levelup_test",
        JWT_SECRET_KEY: "e2e-test-secret",
        E2E_DEBUG_ENDPOINTS: "true",
        TEST_MODE: "true",
      },
    },
    {
      command: "npm run dev",
      cwd: __dirname,
      port: 8080,
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
      env: {
        VITE_BACKEND_PORT: "5001",
      },
    },
  ],
});
