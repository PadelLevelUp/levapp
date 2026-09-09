import { test, expect } from "@playwright/test";
import { addDays, format, startOfWeek } from "date-fns";
import { loginAsCoach } from "../helpers/auth";

/**
 * PAD-27: Mobile weekly class view shows incorrect order while daily view is correct.
 *
 * The phone calendar (MobileCalendar) renders when viewport width < 768px.
 * We intercept the calendar API to return 3 classes on a single day in
 * deliberately wrong chronological order, then verify both the week column
 * preview and the daily detail view display them sorted by startTime.
 */

// Pick the Monday of NEXT week relative to "today". Hardcoding a date here
// would fail every time the calendar passes that date — the test loops
// forward looking for the day, so the date must always be in the future.
const NEXT_MONDAY = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7);
const MOCK_DATE = format(NEXT_MONDAY, "yyyy-MM-dd");
const MOCK_DAY_NUMBER = format(NEXT_MONDAY, "d"); // e.g. "4" or "11"

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

    // Wait for the mobile calendar to render — the week column grid has day buttons.
    // Navigate to the week containing MOCK_DATE (next Monday). Click "Next week"
    // until we see MOCK_DAY_NUMBER in the column headers.
    for (let i = 0; i < 6; i++) {
      const dayVisible = await page
        .locator("button")
        .filter({ hasText: MOCK_DAY_NUMBER })
        .first()
        .isVisible()
        .catch(() => false);
      if (dayVisible) break;
      await page.getByRole("button", { name: /next week/i }).first().click();
      await page.waitForTimeout(400);
    }

    // The week strip now renders a FILL DOT per class rather than a stack of
    // title chips — titles at 9px were unreadable and said nothing actionable,
    // where a hollow dot says "this class still has holes". The ordering
    // guarantee PAD-27 exists for is unchanged, so it is asserted on the dots,
    // which carry their class title for exactly this purpose.
    const mondayColumn = page
      .locator("button")
      .filter({ has: page.locator('[data-event-title="Early Morning"]') })
      .first();
    await expect(mondayColumn).toBeVisible({ timeout: 5000 });

    const orderedTitles = await mondayColumn
      .locator("[data-testid='day-fill-dot']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-event-title")));

    expect(orderedTitles).toEqual([
      "Early Morning",
      "Mid Morning",
      "Afternoon Session",
    ]);

    // Click the day to open the detail view and verify order there too
    await mondayColumn.click();

    // The detail view renders one button per event (PAD-246: cards are real
    // buttons, calendar.mobile-views rule 24) — check their order
    const detailCards = page.getByTestId("calendar-event-card");
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
