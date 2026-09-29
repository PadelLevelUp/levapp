/**
 * PAD-195 — browser push permission never gates the in-app feed.
 *
 * A coach with browser notifications BLOCKED reported "no notifications" on
 * the Messages page: the only thing on screen was "Notificações bloqueadas.
 * Ativa-as nas definições do navegador.", which reads as "this app will not
 * notify you", while the messages list, the live SSE updates and the unread
 * badge were in fact untouched by the browser permission. The fix is copy
 * plus a pinned guarantee (messaging.push-notifications rule 8): with push
 * denied, the feed still loads, a new message still lands live, the badge
 * still updates, and the banner says it is only browser alerts that are off.
 *
 * Permission is forced to "denied" by overriding `Notification.permission`
 * before any script runs — Playwright can grant permissions but not deny
 * them, and a real denial cannot be produced from inside the page.
 *
 * Run a single test:
 *   npx playwright test e2e/messaging/push-denied-feed.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  loginAsCoach,
  COACH_USERNAME,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { openMessages, conversationRow } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

const COACH_NAME = "E2E Coach";

async function apiToken(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** The student sends the coach a message through the API (no second browser). */
async function studentMessagesCoach(request: APIRequestContext, text: string) {
  const token = await apiToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };
  const convos = await request.get(`${API_APP}/conversations`, { headers });
  expect(convos.status()).toBe(200);
  const { conversations } = await convos.json();
  const withCoach = conversations.find(
    (c: { participantName?: string | null }) => c.participantName === COACH_NAME
  );
  expect(withCoach, `student must have a conversation with "${COACH_NAME}"`).toBeTruthy();
  const sent = await request.post(`${API_APP}/message`, {
    headers,
    data: { conversationId: String(withCoach.id), text },
  });
  expect(sent.status()).toBeLessThan(300);
}

test.describe("PAD-195: in-app feed with browser push denied", () => {
  test.beforeEach(async ({ context }) => {
    // Deny before the app boots. Keep Notification/serviceWorker/PushManager in
    // place so the page still counts push as *supported* — that is exactly the
    // state the reporter was in.
    await context.addInitScript(() => {
      const denied = "denied" as NotificationPermission;
      Object.defineProperty(Notification, "permission", { get: () => denied });
      Notification.requestPermission = async () => denied;
    });
  });

  test("the banner only explains browser push, and the feed, live updates and badge keep working", async ({
    page,
    request,
  }) => {
    expect(COACH_USERNAME).toBe("e2e-coach");
    await loginAsCoach(page);
    await openMessages(page);

    // The conversation list is not gated by the permission.
    await expect(conversationRow(page, "E2E Student")).toBeVisible({ timeout: 10_000 });

    // The banner names browser alerts only and says in-app messages still work.
    const banner = page.getByTestId("push-blocked-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText(/navegador|browser/i);
    await expect(banner).toHaveText(/continuam|still arrive/i);

    // Live delivery over SSE, no reload: a fresh student message lands in the
    // list and the nav badge appears.
    await page.evaluate(() => {
      (window as unknown as { __pad195: true }).__pad195 = true;
    });
    const text = `PAD-195 live ping ${Date.now()}`;
    await studentMessagesCoach(request, text);

    // Same badge locator direct-messages.spec.ts (US-62) uses.
    const badge = page
      .locator('a[href="/messages"]')
      .locator(":scope span, :scope [class*='badge']")
      .first();
    await expect(badge).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
    expect(
      await page.evaluate(() => (window as unknown as { __pad195?: true }).__pad195 === true),
      "must not have reloaded"
    ).toBe(true);
  });

  for (const vp of [
    // The phone shows the list and the thread one at a time, so it passed on the old row too;
    // it stays as a regression net for the phone layout.
    { name: "phone", width: 390, height: 844 },
    { name: "short laptop", width: 1280, height: 600 },
    { name: "laptop", width: 1280, height: 720 },
  ]) {
    test(`PAD-417 (${vp.name}): with the banner showing and a long conversation list, the composer stays on screen`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // messaging.push-notifications, "The alerts-blocked banner leaves the thread and composer on
      // screen": the list and the thread share what the banner leaves. The overflow needs a list
      // taller than its pane (B-198 went unreproduced with the seed's two conversations), so the
      // first page is padded, once, with copies of a seeded conversation. The thread under test is
      // the seeded one with E2E Student. Opening it would mark it read (a POST), so that call is
      // answered here and the test writes nothing to the database (R-040).
      await page.route(/\/api\/app\/conversation\/\d+\/read$/, (route) =>
        route.fulfill({ status: 200, json: {} })
      );
      let padded = false;
      await page.route(/\/api\/app\/conversations\?/, async (route) => {
        const res = await route.fetch();
        if (padded) return route.fulfill({ response: res });
        padded = true;
        const json = await res.json();
        const filler = json.conversations.find(
          (c: unknown) => !JSON.stringify(c).includes('"E2E Student"')
        );
        expect(filler, "a seeded conversation to copy").toBeTruthy();
        for (let i = 0; i < 30; i++) json.conversations.push({ ...filler, id: 900_000 + i });
        await route.fulfill({ response: res, json });
      });
      await loginAsCoach(page);
      await openMessages(page);
      await expect(page.getByTestId("push-blocked-banner")).toBeVisible({ timeout: 10_000 });
      // The precondition, or the test passes vacuously: the list really overflows its pane.
      const listViewport = page.locator("[data-radix-scroll-area-viewport]", {
        has: conversationRow(page, "E2E Student"),
      });
      await expect
        .poll(() => listViewport.evaluate((el) => el.scrollHeight - el.clientHeight))
        .toBeGreaterThan(0);
      await conversationRow(page, "E2E Student").click();
      const send = page.getByTestId("composer-send");
      await expect(send).toBeVisible({ timeout: 10_000 });
      // Inside the viewport is not enough: <main> clips its overflow and, on a phone, keeps its
      // bottom padding for the tab bar, so a button pushed past main's content box is hidden while
      // still "in the viewport". Measure against that content box.
      const pastContent = await send.evaluate((el) => {
        const main = el.closest("main")!;
        const contentBottom =
          main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
        return Math.round(el.getBoundingClientRect().bottom - contentBottom);
      });
      expect(pastContent, "px the send button ends past main's content box").toBeLessThanOrEqual(0);
    });
  }
});
