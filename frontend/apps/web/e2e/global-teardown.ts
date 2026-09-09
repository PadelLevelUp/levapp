import path from "path";
import { fileURLToPath } from "url";
import { releaseLock, resolveE2EIsolation } from "./isolation";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** PAD-218: release this run's database lock (never another run's). */
export default async function globalTeardown() {
  const isolation = resolveE2EIsolation(process.env, path.resolve(__dirname, ".."));
  if (releaseLock(isolation.dbName)) {
    console.log(`[global-teardown] Released lock on ${isolation.dbName}.`);
  }
}
