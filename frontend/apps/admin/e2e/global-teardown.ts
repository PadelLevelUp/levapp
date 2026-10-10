import path from "path";
import { fileURLToPath } from "url";
import { releaseLock, resolveE2EIsolation } from "../../web/e2e/isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Release this run's database lock (never another run's). */
export default async function globalTeardown() {
  const isolation = resolveE2EIsolation(process.env, path.resolve(__dirname, "../../web"));
  if (releaseLock(isolation.dbName)) {
    console.log(`[admin global-teardown] Released lock on ${isolation.dbName}.`);
  }
}
