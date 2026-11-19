import { test, expect, type BrowserContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { API_AUTH } from "../helpers/api";
import { openDashboard } from "../helpers/navigation";
import {
  bearer,
  coachSetsLevelAndSide,
  getMe,
  listBlockers,
  signInOnSecondDevice,
  signUpStudentByJoinLink,
} from "../helpers/setupGuide";

/**
 * dashboard.student-setup-guide (PAD-839), web. Every test signs up its own student through the
 * coach's join link: the seed marks seeded students' guide hidden, so none of them sees the sheet.
 * Asserted by test id and data attributes only; no rendered copy.
 */

async function expectNoGuideSurface(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("student-dashboard")).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  for (const id of ["setup-guide-sheet", "setup-guide-card", "setup-guide-ring", "setup-guide-ready"]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
}

test("[DASHBOARD-STUDENT-SETUP-GUIDE-2] a student who joined by link opens the guide at 20%", async ({ browser, page }) => {
  await loginAsCoach(page);
  const student = await signUpStudentByJoinLink(browser, page);
  const s = student.page;

  await openDashboard(s);
  await expect(s.getByTestId("setup-guide-sheet")).toBeVisible({ timeout: 15_000 });

  // 1 of 5 done: the coach link. The card and the ring behind the sheet carry the same percent.
  await expect(s.getByTestId("setup-guide-step-coach_link")).toHaveAttribute("data-state", "done");
  await expect(s.getByTestId("setup-guide-step-request_alerts")).toHaveAttribute("data-state", "pending");
  await expect(s.getByTestId("setup-guide-percent")).toHaveText("20%");
  await expect(s.getByTestId("setup-guide-ring")).toHaveAttribute("data-percent", "20");

  // Step 1 is the current one: "Começar" opens the first pending step, which is request_alerts.
  await s.getByTestId("setup-guide-start").click();
  await expect(s).toHaveURL(/\/setup\?step=request_alerts$/);
  await expect(s.getByTestId("setup-step-request_alerts")).toBeVisible();
  await student.context.close();
});

test("[DASHBOARD-STUDENT-SETUP-GUIDE-5] hide holds on a second session and Configurar conta still opens it", async ({
  browser,
  page,
  request,
}) => {
  await loginAsCoach(page);
  const student = await signUpStudentByJoinLink(browser, page);
  const s = student.page;

  await openDashboard(s);
  await expect(s.getByTestId("setup-guide-sheet")).toBeVisible({ timeout: 15_000 });
  const hidden = s.waitForResponse((r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH");
  await s.getByTestId("setup-guide-hide").click();
  expect((await hidden).status()).toBe(200);
  await expect(s.getByTestId("setup-guide-sheet")).toHaveCount(0);
  // This device too: no card, ring or ready card after the hide (criterion 5).
  await expectNoGuideSurface(s);

  // A second device: signed in as the same student, no sheet, no card, no ring.
  const second = await signInOnSecondDevice(browser, student.username);
  await openDashboard(second.page);
  await expectNoGuideSurface(second.page);
  expect((await getMe(request, student.token)).setupGuide.hidden).toBe(true);

  // Perfil › Configurar conta still opens the guide.
  await second.page.goto("/settings?tab=profile");
  await second.page.getByTestId("settings-setup-guide-open").click();
  await expect(second.page).toHaveURL(/\/setup$/);
  await expect(second.page.getByTestId("setup-guide-overview")).toBeVisible({ timeout: 10_000 });

  await second.context.close();
  await student.context.close();
});

test("[DASHBOARD-STUDENT-SETUP-GUIDE-16] a preset saves and moves on", async ({ browser, page, request }) => {
  await loginAsCoach(page);
  const student = await signUpStudentByJoinLink(browser, page);
  const s = student.page;

  await s.goto("/setup?step=unavailability");
  await expect(s.getByTestId("setup-unavailability")).toBeVisible({ timeout: 15_000 });
  await s.getByTestId("setup-preset-work_weekdays").click();
  const saved = s.waitForResponse((r) => /\/api\/app\/availability_schedules\//.test(r.url()) && r.request().method() === "PUT");
  await s.getByTestId("setup-unavailability-save").click();
  expect((await saved).status()).toBe(200);

  // Coach link is done, so the next pending step after unavailability is the profile step.
  await expect(s).toHaveURL(/\/setup\?step=profile$/, { timeout: 10_000 });

  const rows = await listBlockers(request, student.token);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(row.scheduleId).toBeTruthy();
  expect(row.startTime).toBe("09:00");
  expect(row.endTime).toBe("18:00");
  expect([...(row.recurrenceRule?.daysOfWeek ?? [])].sort()).toEqual([1, 2, 3, 4, 5]);
  expect(row.title).toBe("Trabalho");
  await student.context.close();
});

/**
 * Step 2 (device_push) is done only when this browser has permission AND a push subscription
 * (usePushNotifications: granted and subscribed). Headless Chromium has no push service, so
 * `pushManager.subscribe` cannot make a real subscription. This test therefore grants the
 * notification permission for real (context.grantPermissions) and replaces only the browser's
 * service-worker registration and PushManager with a fake that returns a subscription. The app's
 * own code (the step state, the save to /notifications/save-subscription) still runs.
 */
async function withFakePush(context: BrowserContext) {
  await context.grantPermissions(["notifications"]);
  await context.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    const subscription = {
      endpoint: "https://push.e2e.invalid/pad-839",
      expirationTime: null,
      getKey: () => null,
      toJSON() {
        return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: "BE2Ep256dhKeyPad839", auth: "e2eAuthPad839" } };
      },
    };
    const pushManager = {
      subscribe: async () => subscription,
      getSubscription: async () => subscription,
      permissionState: async () => "granted",
    };
    const registration = { scope: "/", active: {}, pushManager };
    Object.defineProperty(navigator.serviceWorker, "getRegistration", { value: async () => registration });
    Object.defineProperty(navigator.serviceWorker, "register", { value: async () => registration });
  });
}

test("[DASHBOARD-STUDENT-SETUP-GUIDE-18] the ready card shows until closed", async ({ browser, page, request }) => {
  test.setTimeout(180_000);
  await loginAsCoach(page);
  const student = await signUpStudentByJoinLink(browser, page, withFakePush);
  const s = student.page;

  // Steps 1, 3, 5 through the API the guide itself uses; 4 came with the join link; 2 with the fake push above.
  await coachSetsLevelAndSide(request, student.username);
  const patched = await request.patch(`${API_AUTH}/me`, {
    headers: bearer(student.token),
    data: { requestAlerts: true, setupGuideAlertsConfirmed: true, alwaysAvailable: true },
  });
  expect(patched.status(), "PATCH /auth/me").toBe(200);

  await openDashboard(s);
  await expect(s.getByTestId("setup-guide-ready")).toBeVisible({ timeout: 15_000 });
  await expect(s.getByTestId("setup-guide-sheet")).toHaveCount(0);

  await s.reload();
  await expect(s.getByTestId("setup-guide-ready")).toBeVisible({ timeout: 15_000 });

  const closed = s.waitForResponse((r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH");
  await s.getByTestId("setup-guide-ready-close").click();
  expect((await closed).status()).toBe(200);
  await expect(s.getByTestId("setup-guide-ready")).toHaveCount(0);
  expect((await getMe(request, student.token)).setupGuide.readyClosed).toBe(true);

  // A second device (no push there, so its percent is lower) still shows nothing.
  const second = await signInOnSecondDevice(browser, student.username);
  await openDashboard(second.page);
  await expectNoGuideSurface(second.page);
  await second.context.close();
  await student.context.close();
});
