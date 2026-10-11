import { expect, test } from "./fixtures";
import { ui } from "./i18n";

// admin.moderation (PAD-631). Relies on e2e/scripts/admin_session.py, which seeds a student who
// reported two messages of a coach in one conversation (open reports, oldest first in `reportIds`).
// The signed-in staff account is an operator, so the three actions are on screen.
test.use({ locale: "en-US" });

test.describe("moderation", () => {
  test("PAD-631: list -> open the report -> dismiss it", async ({ page, signedIn }) => {
    const id = signedIn.reportIds[0];
    await page.goto("/reports");
    await expect(page.getByTestId(`report-row-${id}`)).toBeVisible();
    await expect(page.getByTestId("admin-nav-reports-count")).toBeVisible();

    await page.getByTestId(`report-link-${id}`).click();
    await expect(page).toHaveURL(new RegExp(`/reports/${id}$`));
    // The reported message is marked among its neighbours, and both participants link to a user view.
    await expect(page.locator('[data-testid^="report-context-"][data-reported="true"]')).toHaveCount(1);
    expect(await page.locator('[data-testid^="report-context-"]').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator('[data-testid^="report-participant-"]')).toHaveCount(2);

    await page.getByTestId("report-dismiss").click();
    await page.getByTestId("report-confirm").click();

    // Closed: the actions are gone and the outcome is shown.
    await expect(page.getByTestId("report-dismiss")).toHaveCount(0);
    await expect(page.getByTestId("report-outcome")).toHaveText(ui("admin.reports.outcome.dismissed"));

    await page.goto("/reports");
    await expect(page.getByTestId(`report-row-${id}`)).toHaveCount(0);
    await page.getByTestId("reports-tab-closed").click();
    await expect(page.getByTestId(`report-row-${id}`)).toBeVisible();
  });

  test("PAD-631: a second report -> delete the message", async ({ page, signedIn }) => {
    const id = signedIn.reportIds[1];
    await page.goto(`/reports/${id}`);
    await page.getByTestId("report-delete-message").click();
    await page.getByTestId("report-confirm").click();

    await expect(page.getByTestId("report-delete-message")).toHaveCount(0);
    await expect(page.getByTestId("report-outcome")).toHaveText(ui("admin.reports.outcome.message_deleted"));
    // The reported message is now marked deleted in the context.
    await expect(page.locator('[data-testid^="report-context-"][data-reported="true"]')).toContainText(ui("admin.report.deletedMarker"));

    await page.goto("/reports");
    await page.getByTestId("reports-tab-closed").click();
    await expect(page.getByTestId(`report-row-${id}`)).toBeVisible();
  });
});
