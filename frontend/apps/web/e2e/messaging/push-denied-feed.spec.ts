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
import { openMessages } from "../helpers/navigation";
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
    await expect(page.getByText("E2E Student").first()).toBeVisible({ timeout: 10_000 });

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
    { name: "phone", width: 390, height: 844 },
    { name: "short laptop", width: 1280, height: 600 },
    { name: "laptop", width: 1280, height: 720 },
  ]) test(`PAD-417 (${vp.name}): with the banner showing, the open thread's composer stays inside the viewport`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // messaging.push-notifications rule 8a: the banner takes its own height from the page; the
    // conversation list and the thread share what is left, so the composer is never pushed off.
    await studentMessagesCoach(request, `PAD-417 ${Date.now()}`);
    await loginAsCoach(page);
    await openMessages(page);
    await expect(page.getByTestId("push-blocked-banner")).toBeVisible({ timeout: 10_000 });
    await page.getByText("E2E Student").first().click();
    const send = page.getByTestId("composer-send");
    await expect(send).toBeVisible({ timeout: 10_000 });
    const viewport = page.viewportSize();
    const box = await send.boundingBox();
    expect(viewport && box, "viewport and composer box").toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  });
});
