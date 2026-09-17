/**
 * PAD-357 (classes.class-requests rules 12–14, classes.availability): the
 * "Marcar aula" wizard's private-class path on web — coach → kind → people,
 * recurrence, duration, a free start time, note → one pending request — and
 * an invitee that is not on the coach's roster blocks the request.
 * Test ids and request payloads only, never copy. Every request is withdrawn (releasing its
 * hold) and deleted in `finally`.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, STUDENT2_USERNAME, STUDENT_PASSWORD, STUDENT_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { deleteClassRequests, withdrawClassRequests } from "../helpers/cleanup";

async function bearer(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username, password } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

function isoDaysAhead(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 1 = Monday … 7 = Sunday, the recurrence's convention. */
function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

const coachAuth = (request: APIRequestContext) => bearer(request, COACH_USERNAME, COACH_PASSWORD);
const studentAuth = (request: APIRequestContext) => bearer(request, STUDENT_USERNAME, STUDENT_PASSWORD);

/** Withdraw first (releases the hold on the coach's calendar), then delete the row. */
async function cleanUp(request: APIRequestContext, ids: string[]) {
  await withdrawClassRequests(request, await studentAuth(request), ids);
  await deleteClassRequests(request, await coachAuth(request), ids);
}

async function openPrivateStep(page: Page) {
  await loginAsStudent(page);
  await page.goto("/availability");
  await page.getByTestId("class-request-book").click();
  const wizard = page.getByTestId("class-request-wizard");
  await expect(wizard).toBeVisible();
  // The seeded student has one coach, so the coach step is skipped; pick it if shown.
  const coachButton = wizard.locator('[data-testid^="wizard-coach-"]').first();
  await expect(wizard).not.toHaveAttribute("data-step", "loading", { timeout: 10_000 });
  if (await wizard.getAttribute("data-step") === "coach") await coachButton.click();
  await expect(wizard).toHaveAttribute("data-step", "kind", { timeout: 10_000 });
  await wizard.getByTestId("wizard-kind-private").click();
  await expect(wizard).toHaveAttribute("data-step", "private");
  return wizard;
}

async function sendFirstSlot(page: Page) {
  const wizard = page.getByTestId("class-request-wizard");
  await expect(wizard.getByTestId("wizard-slots")).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
  await wizard.getByTestId("wizard-slot").first().click();
  const posted = page.waitForResponse((r) => /\/api\/app\/class-requests$/.test(r.url()) && r.request().method() === "POST");
  await wizard.getByTestId("wizard-send").click();
  const res = await posted;
  expect(res.status(), await res.text()).toBeLessThan(300);
  await expect(wizard).toHaveCount(0);
  return { body: await res.json(), payload: res.request().postDataJSON() };
}

test("PAD-357: a single private class for one person becomes a pending request", async ({ page, request }) => {
  test.setTimeout(120_000);
  const ids: string[] = [];
  try {
    const wizard = await openPrivateStep(page);
    await expect(wizard.getByTestId("wizard-people-1")).toHaveAttribute("aria-pressed", "true");
    await expect(wizard.getByTestId("wizard-recurrence-single")).toHaveAttribute("aria-pressed", "true");
    await wizard.getByTestId("wizard-date").fill(isoDaysAhead(13));
    await wizard.getByTestId("wizard-duration-90").click();
    const { body, payload } = await sendFirstSlot(page);
    ids.push(String(body.id));

    expect(payload).toMatchObject({ date: isoDaysAhead(13) });
    expect(payload.participants ?? []).toEqual([]);
    expect(payload.recurrence ?? null).toBeNull();
    // 90 minutes between start and end.
    const [sh, sm] = String(payload.startTime).split(":").map(Number);
    const [eh, em] = String(payload.endTime).split(":").map(Number);
    expect(eh * 60 + em - (sh * 60 + sm)).toBe(90);

    const row = page.locator(`[data-testid="class-request-row"][data-request-id="${body.id}"]`);
    await expect(row).toHaveAttribute("data-status", "pending", { timeout: 10_000 });
  } finally {
    await cleanUp(request, ids);
  }
});

test("PAD-357: a weekly class with an invitee from the coach's roster is one request", async ({ page, request }) => {
  test.setTimeout(120_000);
  const ids: string[] = [];
  const startDate = isoDaysAhead(15);
  const endDate = isoDaysAhead(29);
  try {
    const wizard = await openPrivateStep(page);
    await wizard.getByTestId("wizard-people-2").click();
    await expect(wizard.getByTestId("wizard-invitees-note")).toBeVisible();
    await wizard.getByTestId("wizard-invitee-0").fill(STUDENT2_USERNAME);
    await expect(wizard.getByTestId("wizard-invitee-0")).toHaveAttribute("data-state", "ok", { timeout: 10_000 });

    await wizard.getByTestId("wizard-recurrence-weekly").click();
    await wizard.getByTestId(`wizard-weekday-${isoWeekday(startDate)}`).click();
    await wizard.getByTestId("wizard-start-date").fill(startDate);
    await wizard.getByTestId("wizard-end-date").fill(endDate);

    const { body, payload } = await sendFirstSlot(page);
    ids.push(String(body.id));
    expect(payload).toMatchObject({
      date: startDate,
      participants: [STUDENT2_USERNAME],
      recurrence: { weekdays: [isoWeekday(startDate)], startDate, endDate },
    });
    expect(body.recurrence).toMatchObject({ startDate, endDate });
    expect((body.participants ?? []).map((p: { username: string }) => p.username)).toEqual([STUDENT2_USERNAME]);
  } finally {
    await cleanUp(request, ids);
  }
});

test("PAD-357: an invitee who is not on the coach's roster blocks the request", async ({ page }) => {
  const wizard = await openPrivateStep(page);
  await wizard.getByTestId("wizard-people-2").click();
  await wizard.getByTestId("wizard-invitee-0").fill(`no-such-player-${Date.now()}`);
  await expect(wizard.getByTestId("wizard-invitee-0")).toHaveAttribute("data-state", "USERNAME_NOT_FOUND", { timeout: 10_000 });
  await expect(wizard.getByTestId("wizard-invitee-0-error")).toHaveAttribute("data-reason", "USERNAME_NOT_FOUND");
  await expect(wizard.getByTestId("wizard-slots")).toHaveAttribute("data-state", "waiting");
  await expect(wizard.getByTestId("wizard-send")).toBeDisabled();
});
