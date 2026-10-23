import { expect, test } from "./fixtures";

// admin.finance rule 12 (PAD-742), "Usable from a phone": every tab and the cost form fit 375 px,
// and the tables scroll in their own container. A layout check: the finance API is answered by
// route mocks and the browser session says "owner" (the seeded staff role is operator; the backend's
// owner-only rule has its own tests in test_pad742_finance_costs.py).
test.use({ viewport: { width: 375, height: 667 }, locale: "en-US" });

const SUMMARY = {
  categories: ["infrastructure", "ai_tools", "stores", "domains_dns", "email_crm", "other"],
  start: "2026-01",
  months: Array.from({ length: 10 }, (_, i) => {
    const month = `2026-${String(i + 1).padStart(2, "0")}`;
    return { month, byCategory: { infrastructure: "35.12", ai_tools: "368.74", stores: "8.25" }, total: "412.11", cumulative: (412.11 * (i + 1)).toFixed(2) };
  }),
  superseded: [],
  importStatus: { configured: true, lastRun: { outcome: "error", startedAt: "2026-10-22T04:07:00Z", finishedAt: "2026-10-22T04:07:02Z", errorCode: "PERMISSION_DENIED" }, lastOkAt: "2026-10-20T04:07:05Z", stale: true },
};

const COST = {
  id: 1, category: "ai_tools", vendor: "Anthropic", description: "Claude Max (second subscription)", currency: "USD",
  amount: "200.00", amountEur: "184.37", recurrence: "monthly", startsOn: "2026-01-03", endsOn: null, gcpInvoice: false,
  notes: null, createdByEmail: "owner@levapp.app", updatedByEmail: "owner@levapp.app", deletedAt: null, deletedByEmail: null,
  createdAt: "2026-10-22T10:00:00Z", updatedAt: "2026-10-22T10:00:00Z",
};

test.beforeEach(async ({ page, signedIn }) => {
  await page.addInitScript(({ email, roleId, expiresAt }) => {
    sessionStorage.setItem("levapp-admin-session", JSON.stringify({ email, role: "owner", roleId, expiresAt }));
  }, signedIn);
  await page.route(/\/admin\/api\/finance\//, (route) => {
    const url = route.request().url();
    const body = url.includes("/summary")
      ? SUMMARY
      : url.includes("/costs")
        ? { items: [COST, { ...COST, id: 2, vendor: "Apple", description: "Developer Program", recurrence: "annual" }] }
        : url.includes("/import-runs")
          ? { items: [{ id: 1, trigger: "schedule", actorEmail: null, startedAt: "2026-10-22T04:07:00Z", finishedAt: "2026-10-22T04:07:02Z", outcome: "error", months: ["2026-09", "2026-10"], rows: 0, errorCode: "PERMISSION_DENIED", errorMessage: "HTTP 403" }] }
          : { month: "2026-10", items: [{ projectId: "demo-project-with-a-long-id", service: "Compute Engine", currency: "EUR", cost: "40.12", credits: "-5.00", net: "35.12" }] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
});

async function fits(page: import("@playwright/test").Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `scrollWidth on ${where}`).toBe(375);
}

test.describe("finance on a phone", () => {
  test("PAD-742: every tab and the cost form fit 375 px", async ({ page }) => {
    await page.goto("/finance");
    await expect(page.getByTestId("finance-summary-table")).toBeVisible();
    await expect(page.getByTestId("finance-import-banner")).toBeVisible();
    await fits(page, "summary");
    const scroll = page.getByTestId("finance-summary-table-scroll");
    expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

    await page.getByTestId("finance-tab-costs").click();
    await expect(page.getByTestId("finance-costs-table")).toBeVisible();
    await fits(page, "costs");
    await page.getByTestId("finance-cost-add").click();
    await expect(page.getByTestId("finance-cost-form")).toBeVisible();
    await fits(page, "cost form");

    await page.getByTestId("finance-tab-gcp").click();
    await expect(page.getByTestId("finance-gcp-table")).toBeVisible();
    await expect(page.getByTestId("finance-gcp-runs")).toBeVisible();
    await fits(page, "gcp");
  });
});
