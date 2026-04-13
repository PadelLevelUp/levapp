import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";

/**
 * PAD-27: Mobile weekly class view shows incorrect order while daily view is correct.
 *
 * The MobileCalendarView renders when viewport width < 768px.
 * We intercept the calendar API to return 3 classes on a single day in
 * deliberately wrong chronological order, then verify both the week column
 * preview and the daily detail view display them sorted by startTime.
 */

const MOCK_DATE = "2026-04-20"; // A Monday

const MOCK_EVENTS = [
  {
    id: "class-901",
    model: "LessonInstance",
    originalId: 901,
    type: "class",
    isRecurring: false,
    title: "Afternoon Session",
    date: MOCK_DATE,
    startTime: "14:00",
    endTime: "15:00",
    color: "#6366f1",
    classType: "academy",
    status: "scheduled",
    participantCount: 2,
    maxPlayers: 6,
  },
  {
    id: "class-902",
    model: "LessonInstance",
    originalId: 902,
    type: "class",
    isRecurring: false,
    title: "Early Morning",
    date: MOCK_DATE,
    startTime: "08:00",
    endTime: "09:00",
    color: "#22c55e",
    classType: "private",
    status: "scheduled",
    participantCount: 1,
    maxPlayers: 2,
  },
  {
    id: "class-903",
    model: "LessonInstance",
    originalId: 903,
    type: "class",
    isRecurring: false,
    title: "Mid Morning",
    date: MOCK_DATE,
    startTime: "10:00",
    endTime: "11:00",
    color: "#f59e0b",
    classType: "academy",
    status: "scheduled",
    participantCount: 3,
    maxPlayers: 6,
  },
];

test.describe("PAD-27: Mobile weekly view class ordering", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone-sized

  test("classes in weekly column preview are sorted by start time", async ({
    page,
  }) => {
    await loginAsCoach(page);

    // Intercept calendar API to return our deliberately unsorted events
    await page.route("**/app/calendar**", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_EVENTS),
      });
    });

    await page.goto("/calendar");
    await page.waitForURL("**/calendar");

    // Wait for the mobile calendar to render — the week column grid has day buttons
    // Navigate to the week containing MOCK_DATE (April 20, 2026 is a Monday)
    // Click "Next week" until we see "20" in the column headers
    for (let i = 0; i < 6; i++) {
      const dayVisible = await page
        .locator("button")
        .filter({ hasText: "20" })
        .first()
        .isVisible()
        .catch(() => false);
      if (dayVisible) break;
      await page.getByRole("button", { name: /next week/i }).first().click();
      await page.waitForTimeout(400);
    }

    // Find the day column for April 20 (Monday) — it contains our 3 class titles
    // The week column preview shows class titles in small divs
    const mondayColumn = page.locator("button").filter({ hasText: "Early Morning" }).first();
    await expect(mondayColumn).toBeVisible({ timeout: 5000 });

    // Get the text content of all class cards within this column
    // Classes should appear in order: "Early Morning" (08:00), "Mid Morning" (10:00), "Afternoon Session" (14:00)
    const classTexts = await mondayColumn
      .locator("div[style]")
      .allTextContents();

    // Filter to just our known class titles (in the order they appear in DOM)
    const orderedTitles = classTexts.filter((t) =>
      ["Early Morning", "Mid Morning", "Afternoon Session"].includes(t.trim())
    );

    expect(orderedTitles).toEqual([
      "Early Morning",
      "Mid Morning",
      "Afternoon Session",
    ]);

    // Click the day to open the detail view and verify order there too
    await mondayColumn.click();

    // The detail view uses CalendarEventCard components — check their order
    const detailCards = page.locator(".cursor-pointer");
    await expect(detailCards.first()).toBeVisible({ timeout: 3000 });

    const detailTexts = await detailCards.allTextContents();
    const detailTitles = detailTexts.filter((t) =>
      t.includes("Early Morning") ||
      t.includes("Mid Morning") ||
      t.includes("Afternoon Session")
    );

    // Verify the detail view titles appear in chronological order
    const earlyIdx = detailTitles.findIndex((t) => t.includes("Early Morning"));
    const midIdx = detailTitles.findIndex((t) => t.includes("Mid Morning"));
    const afterIdx = detailTitles.findIndex((t) =>
      t.includes("Afternoon Session")
    );

    expect(earlyIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(afterIdx);
  });
});
