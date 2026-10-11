import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  COACH_USERNAME,
  COACH_PASSWORD,
  COACH_NOLEVELS_USERNAME,
  COACH_NOLEVELS_PASSWORD,
} from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";
import { API_ROOT } from "../helpers/api";

/**
 * PAD-78 introduced pending-confirmation tracking — how many students
 * invited/notified for tomorrow's classes have neither confirmed nor declined —
 * plus a "send manual notification" action that fires an extra reminder to only
 * the pending students.
 *
 * The dashboard redesign replaced the dedicated card (and its button) with the
 * "needs you" queue, so the card UI no longer exists. The notify endpoint the
 * card used is still the product behaviour PAD-78 specified, so it is covered
 * HTTP-level here; the UI assertions cover its replacement surface.
 *
 * Seed (e2e/scripts/seed.py): the "E2E Pending Confirm Class" is TOMORROW with
 * 2 students still pending (sent), 1 confirmed and 1 declined -> count = 2.
 * Its instance has automatic invitations OFF (PAD-597 / B-442): the E2E backend's
 * never-filled-places scan used to invite more students to its free places every
 * two minutes, so `sent` grew with the minutes elapsed before this spec ran. The
 * reply's `sent` still counts every class the coach has tomorrow (another seeded
 * class can fall tomorrow, e.g. Monday's academy class on a Sunday run), so the
 * notify test asserts on this class's own invitations.
 * The no-levels coach has no classes -> nobody to notify.
 */

const API_BASE = `${API_ROOT}/app`;

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("PAD-78: the pending-confirmations card is replaced by the needs-you queue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAsCoach(page);
  const payload = page.waitForResponse(
    (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
    { timeout: 15_000 }
  );
  await openDashboard(page);
  await payload;

  // The old Revenue card stays gone, and the old card did not come back.
  await expect(page.getByText(/revenue/i)).toHaveCount(0);
  await expect(page.getByTestId("dashboard-pending-confirmations")).toHaveCount(0);

  // Its replacement — the needs-you queue — is rendered.
  await expect(page.getByTestId("dashboard-needs-you")).toBeVisible({
    timeout: 10_000,
  });
});

const PENDING_CLASS = "E2E Pending Confirm Class";
// Seed: fillers 06 and 07 pending (sent), 08 confirmed, 09 declined (expired) — e2e/scripts/seed.py.
const PENDING = ["Filler Player 06", "Filler Player 07"];
const ANSWERED = ["Filler Player 08", "Filler Player 09"];

/** Each student's current invitation id on the seeded pending class. The class payload lists one
 * invitation per student, the latest (dedupe_invitation_events), so a nudge shows as a new id. */
async function invitationsOnThePendingClass(request: APIRequestContext, token: string): Promise<Record<string, number>> {
  const events = await request.get(`${API_ROOT}/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59`, { headers: bearer(token) });
  expect(events.ok()).toBeTruthy();
  const ev = ((await events.json()) as Array<Record<string, unknown>>).find((e) => e.title === PENDING_CLASS);
  expect(ev, "the seeded pending-confirm class").toBeTruthy();
  const res = await request.post(`${API_BASE}/class_instance?model=${ev!.model}&id=${ev!.originalId}&date=${ev!.date}`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  const ids: Record<string, number> = {};
  for (const i of ((await res.json()).invitations ?? []) as Array<{ id: number; playerName: string }>) {
    ids[i.playerName] = i.id;
  }
  return ids;
}

test("PAD-78: manual notify reaches only the still-pending students", async ({
  request,
}) => {
  const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
  const before = await invitationsOnThePendingClass(request, token);
  for (const name of [...PENDING, ...ANSWERED]) expect(before[name], `seeded invitation of ${name}`).toBeTruthy();

  const res = await request.post(
    `${API_BASE}/dashboard/pending-confirmations/notify`,
    { headers: bearer(token) }
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  // B-442 / PAD-597: the reply counts every pending student of EVERY class the coach has tomorrow,
  // and the E2E backend's scheduler invites to the free places of any seeded class that falls
  // tomorrow — on a Sunday run the "E2E Academy Class" is Monday's, which made it 12. So the total
  // is only a floor; the seeded class's own invitations are the assertion.
  expect(body.sent).toBeGreaterThanOrEqual(PENDING.length);
  const after = await invitationsOnThePendingClass(request, token);
  for (const name of PENDING) expect(after[name], `${name} is nudged: a newer invitation`).toBeGreaterThan(before[name]);
  for (const name of ANSWERED) expect(after[name], `${name} answered and is not nudged`).toBe(before[name]);
});

test("PAD-78: manual notify is a no-op when nobody is pending", async ({
  request,
}) => {
  const token = await getToken(
    request,
    COACH_NOLEVELS_USERNAME,
    COACH_NOLEVELS_PASSWORD
  );
  const res = await request.post(
    `${API_BASE}/dashboard/pending-confirmations/notify`,
    { headers: bearer(token) }
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.sent).toBe(0);
});
