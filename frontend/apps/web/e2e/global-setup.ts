import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { liveLock, lockPath, resolveE2EIsolation, writeLock } from "./isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PAD-218: resolve the per-checkout database and ports, refuse to touch a
 * database another run holds, take the lock, and only then reset the
 * database this run owns.
 *
 * Why a lock and not a port probe: Playwright launches the configured
 * webServers BEFORE this hook runs, so the run's own backend is already
 * listening on its port by now — a port check would always trip on itself.
 * The lock is released by global-teardown and is live only while its pid is.
 */
export default async function globalSetup() {
  const scriptsDir = path.resolve(__dirname, "scripts");
  const checkout = path.resolve(__dirname, "..");
  const isolation = resolveE2EIsolation(process.env, checkout);

  console.log(
    `[global-setup] E2E stack: db=${isolation.dbName} backend=:${isolation.backendPort} ` +
      `web=:${isolation.webPort} (${isolation.source}, checkout ${isolation.checkoutId})`
  );

  const holder = liveLock(isolation.dbName);
  if (holder) {
    throw new Error(
      `[global-setup] Refusing to reset ${isolation.dbName}: another Playwright run holds it ` +
        `(pid ${holder.pid}, started ${holder.startedAt}, checkout ${holder.checkout}).\n` +
        `Wait for it to finish, or run with a different E2E_DB_NAME. ` +
        `Lock: ${lockPath(isolation.dbName)}`
    );
  }
  writeLock(isolation.dbName, checkout);

  console.log(`[global-setup] Resetting test database ${isolation.dbName}…`);
  execSync(`bash "${scriptsDir}/reset-test-db.sh"`, {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_DB_NAME: isolation.dbName,
      E2E_BACKEND_PORT: isolation.backendPort,
      E2E_WEB_PORT: isolation.webPort,
      // The lock check above already ran, and the run's own backend is up on
      // the shared port when E2E_SHARED=1 — the script's bare-run guards would
      // trip on ourselves.
      E2E_RESET_FROM_PLAYWRIGHT: "1",
    },
  });
  console.log("[global-setup] Test database ready.");
}
