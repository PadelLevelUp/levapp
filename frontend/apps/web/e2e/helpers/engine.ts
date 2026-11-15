/**
 * PAD-920: the new engine's setup for a spec (e2e/scripts/engine_e2e.py, shared with the Maestro
 * runner). Runs the backend venv's Python against this run's database, the same env reset-test-db.sh
 * hands seed.py.
 */
import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { resolveE2EIsolation } from "../isolation";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "../scripts/engine_e2e.py");
const BACKEND = path.resolve(__dirname, "../../../../../backend");

function run<T>(...args: string[]): T {
  const { dbName } = resolveE2EIsolation(process.env, path.resolve(__dirname, "../.."));
  const out = execFileSync(path.join(BACKEND, ".venv/bin/python"), [SCRIPT, ...args], {
    cwd: BACKEND,
    encoding: "utf8",
    env: {
      ...process.env,
      FLASK_APP: "padel_app",
      POSTGRES_DB: dbName,
      POSTGRES_HOST: process.env.POSTGRES_HOST ?? "localhost",
      POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5432",
      POSTGRES_USER: process.env.POSTGRES_USER ?? "padel_app_user",
      POSTGRES_PW: process.env.POSTGRES_PW ?? "",
    },
  });
  const last = out.trim().split("\n").pop() ?? "{}";
  return JSON.parse(last) as T;
}

/** The coach on the new engine (notifications.config rule 18), through the real switch. */
export const switchCoachToNewEngine = (username: string) => run<{ adopted: string[] }>("switch", username);

/** One new-engine invitation each to the one-off class's open spot, its bubbles sent. */
export const engineInvite = (classTitle: string, ...usernames: string[]) =>
  run<{ instanceId: number; invitations: Record<string, number> }>("invite", classTitle, ...usernames);

/** Test-only: the coach back on the old engine, so the specs after this one see the seed's coach. */
export const restoreOldEngine = (username: string) => run<{ sessionsRemoved: number }>("restore", username);

/** Test-only (PAD-935): the coach's "Later" on one needs-you item undone; the app has no route for it. */
export const unsnoozeNeedsYouItem = (username: string, itemId: string) =>
  run<{ snoozesRemoved: number }>("unsnooze", username, itemId);
