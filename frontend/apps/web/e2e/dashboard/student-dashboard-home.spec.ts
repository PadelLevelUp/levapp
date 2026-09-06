import { test, expect, type Page } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openDashboard } from "../helpers/navigation";

/**
 * PAD-202 — the student dashboard speaks the coach home's design language.
 *
 * Spec: dashboard.blocks rules 3, 3a, 3b; dashboard.navigation rule 9 and the
 * "Student invite opens that exact class" criterion.
 *
 * The seeded e2e-student is enrolled in "E2E Academy Class" (next Monday
 * 10:00, always inside the 7-day window) with a Presence that is invited but
 * not yet confirmed — so the payload carries a hero, one invite in the queue,
 * and one schedule row, and the page can be asserted on real data rather than
 * empty states.
 */

const SEEDED_CLASS = "E2E Academy Class";

type Block = { id?: string; type?: string; data?: Record<string, unknown> };
type Payload = { id?: string; blocks?: Block[] };

async function loadDashboard(page: Page): Promise<Payload> {
  const payload = page.waitForResponse(
    (r) => /\/api\/app\/dashboard/.test(r.url()) && r.status() === 200,
    { timeout: 15_000 }
  );
  await openDashboard(page);
  return (await payload).json();
}

test.describe("PAD-202: student dashboard home", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test("PAD-202: the payload is the home vocabulary, keyed by id", async ({ page }) => {
    const payload = await loadDashboard(page);

    expect(payload.id).toBe("player_default_v1");
    const types = (payload.blocks ?? []).map((b) => b.type);
    expect(types).toEqual([
      "messages_overview",
      "next_class",
      "needs_you",
      "schedule_7d",
      "kpi_grid",
    ]);

    // The seeded invite reaches the queue — the old class_list never could.
    const queue = payload.blocks?.find((b) => b.type === "needs_you");
    const items = (queue?.data?.items ?? []) as Array<{ kind: string; classTitle?: string }>;
    expect(items.some((i) => i.kind === "invite" && i.classTitle === SEEDED_CLASS)).toBe(true);
  });

  test("PAD-202: desktop renders greeting, hero, queue, schedule and KPI tiles", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadDashboard(page);

    const home = page.getByTestId("student-dashboard");
    await expect(home).toBeVisible({ timeout: 10_000 });

    // The greeting is the page's orientation; there is no "Dashboard" heading.
    await expect(
      page.getByRole("heading", { name: /^(Morning|Afternoon|Evening),/ })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^(Dashboard|Painel)$/ })).toHaveCount(0);

    // The same sections the coach home exposes, under the student root.
    await expect(home.getByTestId("dashboard-next-class")).toBeVisible();
    await expect(home.getByTestId("dashboard-needs-you")).toBeVisible();
    await expect(home.getByTestId("dashboard-schedule")).toBeVisible();
    await expect(home.getByText(/NEEDS YOU/)).toBeVisible();
    await expect(home.getByText(/NEXT 7 DAYS/)).toBeVisible();

    // The hero is the seeded class.
    await expect(home.getByTestId("dashboard-next-class")).toContainText(SEEDED_CLASS);

    // KPI tiles keep their ids and link policy, and now carry a denominator.
    const attended = home.getByTestId("dashboard-kpi-attended");
    await expect(attended).toBeVisible();
    await expect(attended).toHaveAttribute("data-clickable", "true");
    await expect(attended).toContainText(/of \d+ lessons?/);
    await expect(home.getByTestId("dashboard-kpi-missed")).toContainText(/of \d+ lessons?/);
    await expect(home.getByTestId("dashboard-kpi-invites")).toHaveAttribute(
      "data-clickable",
      "false"
    );

    // The invite is a queue card that says which class and when.
    const invite = home.getByTestId("dashboard-queue-invite").first();
    await expect(invite).toBeVisible();
    await expect(invite).toContainText(SEEDED_CLASS);
  });

  test("PAD-202: mobile stacks the same blocks in priority order", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadDashboard(page);

    const home = page.getByTestId("student-dashboard");
    await expect(home).toBeVisible({ timeout: 10_000 });

    // Every section renders exactly once — the breakpoint is resolved in JS,
    // so nothing is duplicated-and-hidden.
    for (const id of ["dashboard-next-class", "dashboard-needs-you", "dashboard-schedule"]) {
      await expect(home.getByTestId(id)).toHaveCount(1);
    }
    const ids = await home
      .locator("[data-testid^='dashboard-']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    const order = ids.filter((id) =>
      ["dashboard-next-class", "dashboard-needs-you", "dashboard-schedule", "dashboard-kpis"].includes(
        id ?? ""
      )
    );
    expect(order).toEqual([
      "dashboard-next-class",
      "dashboard-needs-you",
      "dashboard-schedule",
      "dashboard-kpis",
    ]);
  });

  test("PAD-202: the invite card opens that exact class on the calendar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loadDashboard(page);

    const invite = page.getByTestId("dashboard-queue-invite").first();
    await expect(invite).toBeVisible({ timeout: 10_000 });
    await invite.getByRole("button", { name: /open|abrir/i }).click();

    await page.waitForURL((url) => url.pathname === "/calendar", { timeout: 10_000 });
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText(SEEDED_CLASS).first()).toBeVisible();
  });
});
