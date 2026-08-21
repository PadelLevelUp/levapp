import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  COACH_USERNAME,
  COACH_PASSWORD,
  COACH_NOLEVELS_USERNAME,
  COACH_NOLEVELS_PASSWORD,
} from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

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
 * The no-levels coach has no classes -> nobody to notify.
 */

const API_ROOT = "http://localhost:5001/api";
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

test("PAD-78: manual notify reaches only the still-pending students", async ({
  request,
}) => {
  const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
  const res = await request.post(
    `${API_BASE}/dashboard/pending-confirmations/notify`,
    { headers: bearer(token) }
  );
  expect(res.status()).toBe(200);
  const body = await res.json();
  // 2 seeded students are pending for tomorrow; confirmed/declined are not hit.
  expect(body.sent).toBe(2);
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
