import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar, openSettings } from "../helpers/navigation";
import { API_APP } from "../helpers/api";

/**
 * PAD-194 — `clubs.courts` v1: the club's courts in Settings → Club, an
 * optional court on a class, and club · court on the card and the detail.
 *
 * The seeded coach belongs to "E2E Club" and defaults to English. The E2E DB
 * is shared across specs, so every test cleans the courts it created.
 */

async function token(page: Page): Promise<string> {
  const value = await page.evaluate(() => localStorage.getItem("accessToken"));
  expect(value, "a session token is needed").toBeTruthy();
  return value as string;
}

async function clubId(page: Page): Promise<number> {
  const res = await page.request.get(`${API_APP}/coach`, { headers: { Authorization: `Bearer ${await token(page)}` } });
  const body = (await res.json()) as { club: { id: number; name: string } | null };
  expect(body.club, "the seeded coach must have a club").not.toBeNull();
  return body.club!.id;
}

async function deleteAllCourts(page: Page) {
  const headers = { Authorization: `Bearer ${await token(page)}` };
  const id = await clubId(page);
  const res = await page.request.get(`${API_APP}/club/${id}/courts`, { headers });
  for (const court of (await res.json()) as Array<{ id: number }>) {
    await page.request.delete(`${API_APP}/courts/${court.id}`, { headers });
  }
}

async function openClubSettings(page: Page) {
  await openSettings(page);
  await page.getByRole("button", { name: /^club$/i }).first().click();
  await expect(page.getByTestId("club-courts")).toBeVisible({ timeout: 5000 });
}

test.describe("PAD-194 courts", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await deleteAllCourts(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteAllCourts(page);
  });

  test("the coach manages courts in Settings → Club", async ({ page }) => {
    await openClubSettings(page);
    await expect(page.getByTestId("club-courts-empty")).toBeVisible();

    const input = page.getByTestId("club-court-new");
    await input.fill("Campo 1");
    await page.getByTestId("club-court-add").click();
    await expect(page.getByTestId("club-court-name")).toHaveText(["Campo 1"]);
    await input.fill("Campo 2");
    await page.getByTestId("club-court-add").click();
    await expect(page.getByTestId("club-court-name")).toHaveText(["Campo 1", "Campo 2"]);

    // Move Campo 2 up.
    await page.getByTestId("club-court-up").nth(1).click();
    await expect(page.getByTestId("club-court-name")).toHaveText(["Campo 2", "Campo 1"]);

    // Rename the first row.
    await page.getByTestId("club-court-rename").first().click();
    await page.getByTestId("club-court-rename-input").fill("Campo central");
    await page.getByTestId("club-court-rename-save").click();
    await expect(page.getByTestId("club-court-name")).toHaveText(["Campo central", "Campo 1"]);

    // A duplicate name is refused inline.
    await input.fill("campo 1");
    await page.getByTestId("club-court-add").click();
    await expect(page.getByTestId("club-court-error")).toContainText(/already exists/i);
    await expect(page.getByTestId("club-court-name")).toHaveCount(2);

    // Delete the second row.
    await page.getByTestId("club-court-remove").nth(1).click();
    await expect(page.getByTestId("club-court-name")).toHaveText(["Campo central"]);

    // A reload shows the same.
    await page.reload();
    await openClubSettings(page);
    await expect(page.getByTestId("club-court-name")).toHaveText(["Campo central"]);
  });

  test("a class carries its court and the card shows club · court", async ({ page }) => {
    const headers = { Authorization: `Bearer ${await token(page)}` };
    const id = await clubId(page);
    const created = await page.request.post(`${API_APP}/club/${id}/courts`, { headers, data: { name: "Campo 1" } });
    expect(created.status()).toBe(201);

    await openCalendar(page);
    await page.getByRole("button", { name: /new class|add class/i }).first().click();
    await expect(page.getByRole("heading", { name: /new class/i }).or(page.getByText(/new class/i).first())).toBeVisible({
      timeout: 5000,
    });
    await page.getByPlaceholder(/e\.g\./i).first().fill("PAD-194 Court Class");
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(today);

    await page.getByTestId("add-class-court").click();
    await page.getByRole("option", { name: "Campo 1", exact: true }).click();

    const [response] = await Promise.all([
      page.waitForResponse((r) => /\/api\/app\/add_class$/.test(r.url())),
      page.getByRole("button", { name: /create class/i }).click(),
    ]);
    expect(response.status()).toBeLessThan(300);
    const event = (await response.json()) as { court: { name: string } | null; club: { name: string } | null };
    try {
      expect(event.court?.name).toBe("Campo 1");
      expect(event.club?.name).toBe("E2E Club");

      const card = page.getByTestId("calendar-event-card").filter({ hasText: "PAD-194 Court Class" }).first();
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByTestId("calendar-event-place")).toContainText("E2E Club · Campo 1");

      await card.click();
      await expect(page.getByTestId("class-detail-place")).toContainText("E2E Club · Campo 1", { timeout: 10_000 });
    } finally {
      // Leave no class behind: it sits on today's calendar at the form's default time,
      // and later specs that create a class at that time hit the overlap warning (PAD-75).
      await page.request.post(`${API_APP}/remove_class`, { headers, data: { event, scope: "single" } });
    }
  });
});
