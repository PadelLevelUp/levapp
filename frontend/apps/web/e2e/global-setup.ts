import { execSync } from "child_process";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { resolveE2EIsolation, SHARED_BACKEND_PORT, SHARED_DB_NAME } from "./isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** True when something already accepts TCP connections on `port` (localhost). */
export function isListening(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

function whoHolds(port: string): string {
  try {
    return execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | tail -n +2`, {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * PAD-218: resolve the per-checkout database and ports, refuse to touch the
 * shared `levelup_test` while a backend is listening on 5001 (another
 * session's live run), and only then reset the database this run owns.
 */
export default async function globalSetup() {
  const scriptsDir = path.resolve(__dirname, "scripts");
  const isolation = resolveE2EIsolation(process.env, path.resolve(__dirname, ".."));

  console.log(
    `[global-setup] E2E stack: db=${isolation.dbName} backend=:${isolation.backendPort} ` +
      `web=:${isolation.webPort} (${isolation.source}, checkout ${isolation.checkoutId})`
  );

  if (isolation.dbName === SHARED_DB_NAME && (await isListening(Number(SHARED_BACKEND_PORT)))) {
    const holder = whoHolds(SHARED_BACKEND_PORT);
    throw new Error(
      `[global-setup] Refusing to drop ${SHARED_DB_NAME}: a backend is already listening on ` +
        `:${SHARED_BACKEND_PORT}${holder ? ` —\n${holder}` : ""}\n` +
        `Another session's suite is probably mid-run. Run without E2E_SHARED to get a ` +
        `per-checkout database, or wait for that run to finish.`
    );
  }
  if (await isListening(Number(isolation.backendPort))) {
    const holder = whoHolds(isolation.backendPort);
    throw new Error(
      `[global-setup] Port :${isolation.backendPort} is already taken${holder ? ` by\n${holder}` : ""}.\n` +
        `Not resetting ${isolation.dbName}. Pick another E2E_BACKEND_PORT or stop that process.`
    );
  }

  console.log(`[global-setup] Resetting test database ${isolation.dbName}…`);
  execSync(`bash "${scriptsDir}/reset-test-db.sh"`, {
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_DB_NAME: isolation.dbName,
      E2E_BACKEND_PORT: isolation.backendPort,
      E2E_WEB_PORT: isolation.webPort,
    },
  });
  console.log("[global-setup] Test database ready.");
}
