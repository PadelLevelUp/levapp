/**
 * E2E for the `waiting_list_offer` message's Yes/No (PAD-124).
 *
 * The offer is sent on the "sorry, that spot was just filled" path and is the
 * entire self-service route onto the waiting list. Until PAD-124 the message
 * rendered as plain text on both web and iOS, so `POST
 * /api/app/notify/respond_waiting_list` had no caller anywhere and the student
 * half of `notifications.waiting-list` rule 1 was unreachable.
 *
 * The offer is seeded through the E2E debug endpoint, which calls the engine's
 * own `_offer_waiting_list()` — producing the real message shape rather than a
 * hand-built row. Driving the natural path would need two students racing for
 * one vacancy, which is the invitation engine's test, not this one.
 *
 * Run a single test:
 *   npx playwright test e2e/notification-engine/waiting-list-offer.spec.ts --headed
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const API_BASE = API_APP;
const AUTH_BASE = API_AUTH;

/** Log in as coach via API and return a JWT token. */
async function coachApiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, {
    data: { username: "e2e-coach", password: "E2eCoach123!" },
  });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/**
 * A fresh future instance plus a `waiting_list_offer` on it for e2e-student.
 *
 * A dedicated instance keeps the test hermetic — other notification specs
 * mutate the seeded class's attendance. `secondsUntilReminderFires` is large so
 * the scheduled reminder job never fires mid-test and adds a second bubble.
 */
async function seedOffer(request: APIRequestContext, token: string): Promise<number> {
  const debugRes = await request.post(`${API_BASE}/notify/debug/schedule_reminder_test`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { secondsUntilReminderFires: 3600 },
  });
  expect(debugRes.ok()).toBe(true);
  const { instanceId } = (await debugRes.json()) as { instanceId: number };
  expect(typeof instanceId).toBe("number");

  const offerRes = await request.post(`${API_BASE}/notify/debug/offer_waiting_list`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { lessonInstanceId: instanceId, username: "e2e-student" },
  });
  expect(offerRes.ok()).toBe(true);

  return instanceId;
}

// ---------------------------------------------------------------------------
// US-WL-01: the student can answer Yes on a waiting-list offer
// ---------------------------------------------------------------------------

test("US-WL-01: Yes on a waiting_list_offer queues the student and settles the bubble", async ({
  request,
  browser,
}) => {
  const token = await coachApiToken(request);
  const instanceId = await seedOffer(request, token);

  const studentCtx = await browser.newContext();
  try {
    const studentPage = await studentCtx.newPage();
    await loginAsStudent(studentPage);
    await openMessages(studentPage);

    const coachConv = studentPage.getByText(/e2e coach/i).first();
    await expect(coachConv).toBeVisible({ timeout: 5000 });
    await Promise.all([
      studentPage
        .waitForResponse(
          (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
          { timeout: 10_000 }
        )
        .catch(() => null),
      coachConv.click(),
    ]);

    // Before PAD-124 this block does not exist at all — the offer is plain text.
    const actions = studentPage.getByTestId("waiting-list-offer-actions").last();
    await expect(actions).toBeVisible({ timeout: 10_000 });

    const yes = actions.getByRole("button", { name: /^yes$|^sim$/i });
    await expect(yes).toBeVisible();

    const [respondRes] = await Promise.all([
      studentPage.waitForResponse(
        (r) => r.url().includes("/notify/respond_waiting_list"),
        { timeout: 10_000 }
      ),
      yes.click(),
    ]);
    expect(respondRes.status()).toBe(200);
    expect((await respondRes.json()).action).toBe("added_to_waiting_list");

    // The bubble settles into the answered state, exactly as the reminder does.
    // Locale is pt pre-auth on some runs, so match either language.
    await expect(
      actions.getByText(/on the waiting list|na lista de espera/i)
    ).toBeVisible({ timeout: 5000 });
    await expect(actions.getByRole("button", { name: /^yes$|^sim$/i })).toHaveCount(0);

    // And it survives a reload — the answer is recorded on the message, not
    // just in component state.
    await studentPage.reload();
    await expect(
      studentPage.getByText(/on the waiting list|na lista de espera/i).last()
    ).toBeVisible({ timeout: 15_000 });

    // The entry the coach sees is the one the student just created.
    const listRes = await request.get(`${API_BASE}/notify/waiting_list/${instanceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBe(true);
    expect((await listRes.json()).length).toBeGreaterThan(0);
  } finally {
    await studentCtx.close();
  }
});

// ---------------------------------------------------------------------------
// US-WL-02: answering No closes the offer without queueing anyone
// ---------------------------------------------------------------------------

test("US-WL-02: No on a waiting_list_offer closes it and queues nobody", async ({
  request,
  browser,
}) => {
  const token = await coachApiToken(request);
  const instanceId = await seedOffer(request, token);

  const studentCtx = await browser.newContext();
  try {
    const studentPage = await studentCtx.newPage();
    await loginAsStudent(studentPage);
    await openMessages(studentPage);

    const coachConv = studentPage.getByText(/e2e coach/i).first();
    await expect(coachConv).toBeVisible({ timeout: 5000 });
    await Promise.all([
      studentPage
        .waitForResponse(
          (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
          { timeout: 10_000 }
        )
        .catch(() => null),
      coachConv.click(),
    ]);

    const actions = studentPage.getByTestId("waiting-list-offer-actions").last();
    await expect(actions).toBeVisible({ timeout: 10_000 });

    const [respondRes] = await Promise.all([
      studentPage.waitForResponse(
        (r) => r.url().includes("/notify/respond_waiting_list"),
        { timeout: 10_000 }
      ),
      actions.getByRole("button", { name: /^no$|^não$/i }).click(),
    ]);
    expect(respondRes.status()).toBe(200);
    expect((await respondRes.json()).action).toBe("declined");

    await expect(
      actions.getByText(/^declined$|^recusado$/i)
    ).toBeVisible({ timeout: 5000 });

    const listRes = await request.get(`${API_BASE}/notify/waiting_list/${instanceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok()).toBe(true);
    expect((await listRes.json()).length).toBe(0);
  } finally {
    await studentCtx.close();
  }
});
