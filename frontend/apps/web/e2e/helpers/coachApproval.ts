import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { resolveE2EIsolation } from "../isolation";

/**
 * PAD-532: approving and rejecting a coach moved to the staff console
 * (admin.levapp.app), so the product API no longer has the routes. Specs that
 * only need a coach in a given approval state set it straight in the E2E
 * database, through the same `psql` + env the reset script uses
 * (e2e/scripts/reset-test-db.sh). The database name follows the same
 * per-checkout isolation as the backend (e2e/isolation.ts).
 */
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function psql(sql: string, vars: Record<string, string>): string {
  const { dbName } = resolveE2EIsolation(process.env, WEB_DIR);
  const args = [
    "-h", process.env.POSTGRES_HOST ?? "localhost",
    "-p", process.env.POSTGRES_PORT ?? "5432",
    "-U", process.env.POSTGRES_USER ?? "padel_app_user",
    "-d", dbName,
    "-v", "ON_ERROR_STOP=1",
    "-tA",
  ];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  args.push("-f", "-");
  return execFileSync("psql", args, {
    input: sql,
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.POSTGRES_PW ?? "" },
  }).trim();
}

/** What the staff console's approve does to the row (approved_by stays null). */
export function approveCoachInDb(username: string): void {
  const out = psql(
    `UPDATE coaches SET approval_status = 'approved', approved_at = now(), rejection_reason = NULL
       FROM users WHERE coaches.user_id = users.id AND users.username = :'u' RETURNING coaches.id;`,
    { u: username },
  );
  if (!out) throw new Error(`approveCoachInDb: no coach for username ${username}`);
}

/** What the staff console's reject does to the row. */
export function rejectCoachInDb(username: string, reason: string): void {
  const out = psql(
    `UPDATE coaches SET approval_status = 'rejected', rejection_reason = :'r'
       FROM users WHERE coaches.user_id = users.id AND users.username = :'u' RETURNING coaches.id;`,
    { u: username, r: reason },
  );
  if (!out) throw new Error(`rejectCoachInDb: no coach for username ${username}`);
}

export function coachApprovalStatusInDb(username: string): string | null {
  const out = psql(
    `SELECT coaches.approval_status FROM coaches JOIN users ON users.id = coaches.user_id WHERE users.username = :'u';`,
    { u: username },
  );
  return out || null;
}
