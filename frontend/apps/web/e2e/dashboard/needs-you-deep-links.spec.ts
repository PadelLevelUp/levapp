/**
 * dashboard.blocks rule 10 (PAD-284 / PAD-285): a needs-you item lands where
 * the work is — a reply on THAT conversation, "Convidar" on the class with
 * Notificar already open. (PAD-283's validation card is covered by
 * validation-count.spec.ts.)
 *
 * Seed: the coach has one unread message from e2e-student (Conversation 1) and
 * at least one under-capacity class in the next 7 days.
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

async function openDashboard(page: import("@playwright/test").Page) {
  const dashboard = page.waitForResponse((r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200);
  await page.goto("/");
  await dashboard;
  await expect(page.getByTestId("dashboard-needs-you")).toBeVisible({ timeout: 15_000 });
}

test("PAD-284: a reply card opens that conversation", async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);
  const reply = page.getByTestId("dashboard-queue-reply").first();
  await expect(reply).toBeVisible({ timeout: 15_000 });
  await reply.click();
  await expect(page).toHaveURL(/\/messages\/\d+$/, { timeout: 15_000 });
  await expect(page.getByTestId("message-scroller")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/page not found|página não encontrada|404/i)).toHaveCount(0);
});

test("PAD-285: Convidar opens the class with Notificar already open", async ({ page }) => {
  await loginAsCoach(page);
  await openDashboard(page);
  const cards = page.getByTestId("dashboard-needs-you").locator('[data-testid^="needs-you-empty-seats-"]');
  const n = await cards.count();
  test.skip(n === 0, "no under-capacity class in the next 7 days on this seed day");
  const deepLink = page.waitForURL(/\/calendar\?.*classId=.*notify=1/, { timeout: 15_000 });
  await cards.first().getByRole("button", { name: /convidar|invite/i }).click();
  await deepLink; // the calendar then strips the consumed params from the URL
  // By test id: the picker is a Radix dialog nested inside the class sheet, and
  // the outer sheet's focus trap marks it aria-hidden, which role queries skip.
  const notify = page.getByTestId("notify-students-dialog");
  await expect(notify).toBeVisible({ timeout: 15_000 });
  await expect(notify).toContainText(/Notificar alunos|Notify students/);
});
