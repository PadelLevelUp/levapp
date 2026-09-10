/**
 * PAD-150 (eligibility.enforcement rules 6, 7, 7d, 9, 9b): the coach-facing
 * half of the eligibility bar.
 *
 * Seed facts this relies on (e2e/scripts/seed.py): the coach's ladder is
 * I1 (stronger) → B1; "E2E Academy Class" is B1 with e2e-student (B1) enrolled;
 * the filler players are I1, so adding one to a B1 class with a
 * `same_as_class` bar fails with "1 level above this class"; "E2E Pending
 * Confirm Class" is B1 with intermediate (I1) filler students enrolled.
 *
 * The bar is set through the API and restored in `finally`, because a left-over
 * level rule would change what the invitation-engine specs see.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS = "E2E Academy Class";
const TARGET_STUDENT = "Filler Player 01";

async function coachToken(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function setBar(request: APIRequestContext, token: string, rules: unknown[] | null) {
  const res = await request.post(`${API_ROOT}/app/notify/config`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { eligibilityRules: rules },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function academyEvent(request: APIRequestContext, token: string) {
  const events = await request.get(
    `${API_ROOT}/app/calendar?from=2026-01-01T00:00:00&to=2027-12-31T23:59:59`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return ((await events.json()) as Array<Record<string, unknown>>).find((e) => e.title === CLASS);
}

async function enrolledNames(request: APIRequestContext, token: string): Promise<string[]> {
  const academy = await academyEvent(request, token);
  if (!academy) return [];
  const detail = await request.post(
    `${API_ROOT}/app/class_instance?model=${academy.model}&id=${academy.originalId}&date=${academy.date}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const participants = ((await detail.json()).participants ?? []) as Array<{ user?: { name?: string } }>;
  return participants.map((p) => p.user?.name ?? "");
}

async function openClassEdit(page: import("@playwright/test").Page) {
  await openCalendar(page);
  expect(await findClassOnCalendar(page, CLASS)).toBe(true);
  await page.getByText(CLASS).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByTestId("class-edit")).toBeVisible({ timeout: 10_000 });
  await sheet.getByTestId("class-edit").click();
  // The picker opens on the "Participants" tab; the search box lives on the
  // "All" tab.
  await sheet.getByRole("tab", { name: /^(all|todos)$/i }).click();
  const search = sheet.getByPlaceholder(/search|procurar|pesquisar/i).first();
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill("Filler Player 01");
  await expect(sheet.getByText(TARGET_STUDENT).first()).toBeVisible({ timeout: 10_000 });
  return sheet;
}

test.describe("PAD-150: manual add warns with the named reason", () => {
  test("adding a student who fails the bar asks first; cancel keeps the class, confirm enrols", async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const token = await coachToken(request);
    await setBar(request, token, [{ attribute: "level", operation: "same_as_class" }]);
    try {
      await loginAsCoach(page);
      const sheet = await openClassEdit(page);

      // Tick the stronger student and try to save.
      await sheet.getByText(TARGET_STUDENT).first().click();
      await sheet.getByRole("button", { name: /^(save|guardar)$/i }).first().click();

      const dialog = page.getByTestId("eligibility-confirm");
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog.getByTestId("eligibility-confirm-student")).toHaveCount(1);
      await expect(dialog.getByTestId("eligibility-confirm-student")).toContainText(TARGET_STUDENT);
      await expect(dialog.getByTestId("eligibility-confirm-reason")).toContainText(
        /1 level above this class|1 nível acima desta aula/i
      );

      // Cancel: still in the edit, nothing saved.
      await dialog.getByTestId("eligibility-confirm-cancel").click();
      await expect(dialog).toBeHidden();
      await expect(sheet.getByRole("button", { name: /^(save|guardar)$/i }).first()).toBeVisible();

      // Save again and confirm this time: the student is enrolled.
      const saved = page.waitForResponse(
        (r) => /\/api\/app\/edit_class/.test(r.url()) && r.status() === 200
      );
      await sheet.getByRole("button", { name: /^(save|guardar)$/i }).first().click();
      await page.getByTestId("eligibility-confirm-proceed").click({ timeout: 10_000 });
      const result = await saved;
      expect(result.ok()).toBeTruthy();

      // Enrolled for real (the sheet may close or refetch after the save, so
      // the record, not the DOM, is the evidence).
      const names = await enrolledNames(request, token);
      expect(names).toContain(TARGET_STUDENT);
    } finally {
      // Put the fixture back: no bar, and the class's roster as seeded.
      await setBar(request, token, null);
      const academy = await academyEvent(request, token);
      if (academy) {
        const detail = await request.post(
          `${API_ROOT}/app/class_instance?model=${academy.model}&id=${academy.originalId}&date=${academy.date}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const participants = ((await detail.json()).participants ?? []) as Array<{ id: number | string; user?: { name?: string } }>;
        const extra = participants.find((p) => p.user?.name === TARGET_STUDENT);
        if (extra) {
          await request.post(`${API_ROOT}/app/edit_class`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { event: academy, scope: "single", updates: { removePlayers: [String(extra.id)] } },
          });
        }
      }
    }
  });
});

test.describe("PAD-150: saving a stricter bar reports who it would exclude", () => {
  test("the settings page names the enrolled students who no longer meet the bar", async ({
    page,
    request,
  }) => {
    const token = await coachToken(request);
    await setBar(request, token, null);
    // The engine sections are editable only while automatic notifications are on.
    const cfg = await request.post(`${API_ROOT}/app/notify/config`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { autoNotifyEnabled: true },
    });
    expect(cfg.ok()).toBeTruthy();
    try {
      await loginAsCoach(page);
      await page.goto("/settings");
      await page.getByTestId("settings-nav-notifications").click();
      await page.getByRole("button", { name: /eligibility|elegibilidade/i }).first().click();
      await expect(page.getByTestId("eligibility-section")).toBeVisible({ timeout: 10_000 });

      const saved = page.waitForResponse(
        (r) => /\/api\/app\/notify\/config/.test(r.url()) && r.request().method() === "POST" && r.status() === 200
      );
      // "Add rule" defaults to the level rule (same as the class) and saves at once.
      await page.getByRole("button", { name: /add rule|adicionar regra/i }).first().click();
      await saved;

      const note = page.getByTestId("eligibility-impact");
      await expect(note).toBeVisible({ timeout: 10_000 });
      expect(Number(await note.getAttribute("data-count"))).toBeGreaterThan(0);
      await expect(note).toContainText("E2E Pending Confirm Class");
      await expect(note.getByTestId("eligibility-impact-line").first()).toContainText(
        /above this class|acima desta aula/i
      );
    } finally {
      await setBar(request, token, null);
    }
  });
});
