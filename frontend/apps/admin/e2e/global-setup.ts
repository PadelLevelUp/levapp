import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { liveLock, lockPath, resolveE2EIsolation, writeLock } from "../../web/e2e/isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SESSION_FILE = path.resolve(__dirname, ".admin-session.json");
export const STAFF_EMAIL = "staff.e2e@levapp.app";

/**
 * admin.phone-console rule 7: resolve the web app's per-checkout database, take its run lock (a
 * web suite and a console suite never reset one database under each other), reset it with the
 * web app's own script, then seed the console's rows and mint a console token with the backend's
 * issuer. No Google credential is involved and no test-only endpoint exists.
 */
export default async function globalSetup() {
  const webDir = path.resolve(__dirname, "../../web");
  const isolation = resolveE2EIsolation(process.env, webDir);

  console.log(
    `[admin global-setup] E2E stack: db=${isolation.dbName} backend=:${isolation.backendPort} ` +
      `(${isolation.source}, checkout ${isolation.checkoutId})`
  );

  const holder = liveLock(isolation.dbName);
  if (holder) {
    throw new Error(
      `[admin global-setup] Refusing to reset ${isolation.dbName}: another Playwright run holds it ` +
        `(pid ${holder.pid}, started ${holder.startedAt}, checkout ${holder.checkout}).\n` +
        `Wait for it to finish, or run with a different E2E_DB_NAME. Lock: ${lockPath(isolation.dbName)}`
    );
  }
  writeLock(isolation.dbName, webDir);

  const dbEnv = {
    ...process.env,
    E2E_DB_NAME: isolation.dbName,
    E2E_BACKEND_PORT: isolation.backendPort,
    E2E_WEB_PORT: isolation.webPort,
    E2E_RESET_FROM_PLAYWRIGHT: "1",
  };

  console.log(`[admin global-setup] Resetting test database ${isolation.dbName}…`);
  execSync(`bash "${path.resolve(webDir, "e2e/scripts/reset-test-db.sh")}"`, { stdio: "inherit", env: dbEnv });

  console.log("[admin global-setup] Seeding the console session…");
  const backendDir = path.resolve(__dirname, "../../../../backend");
  const out = execFileSync(
    path.join(backendDir, ".venv/bin/python"),
    [
      path.resolve(__dirname, "scripts/admin_session.py"),
      "--db",
      isolation.dbName,
      "--email",
      STAFF_EMAIL,
      "--role",
      "operator",
    ],
    {
      cwd: backendDir,
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: backendDir,
        FLASK_APP: "padel_app",
        FLASK_ENV: "development",
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5432",
        POSTGRES_USER: "padel_app_user",
        POSTGRES_PW: process.env.POSTGRES_PW ?? "",
        POSTGRES_DB: isolation.dbName,
        JWT_SECRET_KEY: "e2e-test-secret",
        TEST_MODE: "true",
      },
    }
  );
  const json = out
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("{"));
  if (!json) throw new Error(`[admin global-setup] admin_session.py printed no session:\n${out}`);
  fs.writeFileSync(SESSION_FILE, json);
  console.log("[admin global-setup] Console session ready.");
}
