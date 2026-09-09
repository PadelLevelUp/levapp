import { test, expect, type Page } from "@playwright/test";
import { format } from "date-fns";
import { loginAsCoach, loginAsStudent } from "../helpers/auth";

/**
 * PAD-246 — calendar.mobile-views, the Dia view on web at phone widths.
 *
 * The calendar API is intercepted so the day under test carries every card
 * variant the spec names. Everything is on TODAY so the visible week always
 * contains it, which is what turns the "next" treatment on.
 *
 * The seeded coach's language is English (seed.py, PAD-40), so the visible
 * strings are asserted in English; the pt rendering of the same keys is
 * covered by the shared locale mechanism `i18n-date-locale.spec.ts` exercises.
 *
 * Criteria covered: "Segmented control switches modes and remembers the
 * choice", "Coach colour identifies, state treats", "Next class is outlined,
 * not filled", "Canceled is red and only red is canceled", "Empty seats go
 * amber on the bar, not on the card", "Dia strip shows dots, never chips",
 * "Legend is gone on phones and kept on desktop", "FABs on both shells",
 * "Labels follow the language".
 */
const TODAY = format(new Date(), "yyyy-MM-dd");

// Times are chosen so the ordering and the "next" gate are stable whenever
// the suite runs before 23:40 local time: the two upcoming classes sit at the
// very end of the day, the finished one at its start.
const MOCK_EVENTS = [
  {
    id: "class-1001",
    model: "LessonInstance",
    originalId: 1001,
    type: "class",
    isRecurring: true,
    title: "Finished Session",
    date: TODAY,
    startTime: "00:05",
    endTime: "00:35",
    color: "#0D9488",
    classType: "academy",
    status: "completed",
    participantCount: 4,
    maxPlayers: 6,
  },
  {
    id: "class-1002",
    model: "LessonInstance",
    originalId: 1002,
    type: "class",
    isRecurring: false,
    title: "Canceled Session",
    date: TODAY,
    startTime: "01:00",
    endTime: "01:30",
    color: "#0D9488",
    classType: "academy",
    status: "canceled",
    participantCount: 2,
    maxPlayers: 6,
  },
  {
    id: "block-77",
    model: "CalendarBlock",
    originalId: 77,
    type: "block",
    isRecurring: true,
    title: "Almoço",
    date: TODAY,
    startTime: "02:00",
    endTime: "02:30",
    blockType: "break",
  },
  {
    id: "class-1003",
    model: "LessonInstance",
    originalId: 1003,
    type: "class",
    isRecurring: false,
    title: "Next Session",
    date: TODAY,
    startTime: "23:40",
    endTime: "23:50",
    color: "#6366F1",
    classType: "academy",
    status: "scheduled",
    participantCount: 6,
    maxPlayers: 6,
  },
  {
    id: "class-1004",
    model: "LessonInstance",
    originalId: 1004,
    type: "class",
    isRecurring: false,
    title: "Short Session",
    date: TODAY,
    startTime: "23:51",
    endTime: "23:59",
    color: "#1355DC",
    classType: "academy",
    status: "scheduled",
    participantCount: 3,
    maxPlayers: 6,
  },
];

async function mockCalendar(page: Page) {
  await page.route("**/app/calendar**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EVENTS),
    })
  );
}

const PHONE = { width: 390, height: 844 };

test.describe("PAD-246: phone calendar Dia view", () => {
  test.use({ viewport: PHONE });

  test("US-246-1: segmented control shows Dia active and the other modes disabled", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await page.goto("/calendar");

    const dayTab = page.getByTestId("calendar-view-day");
    await expect(dayTab).toHaveAttribute("aria-selected", "true");
    await expect(dayTab).toHaveText("Day");
    await expect(page.getByTestId("calendar-view-week")).toHaveText("Week");
    await expect(page.getByTestId("calendar-view-month")).toHaveText("Month");
    // Semana and Mês ship in PAD-247 / PAD-248.
    await expect(page.getByTestId("calendar-view-week")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    await expect(page.getByTestId("calendar-view-month")).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    // A stored mode that is not enabled yet falls back to Dia.
    await page.evaluate(() =>
      window.localStorage.setItem("levapp.calendar.viewMode", "week")
    );
    await page.reload();
    await expect(page.getByTestId("calendar-view-day")).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("US-246-2: cards carry the coach colour and their state treatment", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await page.goto("/calendar");

    const cards = page.getByTestId("calendar-event-card");
    await expect(cards).toHaveCount(5);

    const byTitle = (title: string) =>
      cards.filter({ has: page.getByText(title, { exact: true }) });

    // Coach colour as the solid surface on a scheduled class.
    const short = byTitle("Short Session");
    await expect(short).toHaveAttribute("data-event-state", "scheduled");
    await expect(short).toHaveCSS("background-color", "rgb(19, 85, 220)");

    // Next: outlined in its own colour, not filled with it.
    const next = byTitle("Next Session");
    await expect(next).toHaveAttribute("data-event-state", "next");
    await expect(next).toHaveCSS("border-top-color", "rgb(99, 102, 241)");
    await expect(next).not.toHaveCSS("background-color", "rgb(99, 102, 241)");

    // Past: faded, not the raw hue.
    const past = byTitle("Finished Session");
    await expect(past).toHaveAttribute("data-event-state", "past");
    await expect(past).not.toHaveCSS("background-color", "rgb(13, 148, 136)");

    // Canceled: the destructive surface, and nothing else uses it.
    const canceled = byTitle("Canceled Session");
    await expect(canceled).toHaveAttribute("data-event-state", "canceled");
    await expect(canceled).toContainText("Canceled");
    const canceledBg = await canceled.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    for (const title of ["Short Session", "Next Session", "Finished Session", "Almoço"]) {
      await expect(byTitle(title)).not.toHaveCSS("background-color", canceledBg);
    }

    // Block: dashed card with the block type as subtitle.
    const block = byTitle("Almoço");
    await expect(block).toHaveAttribute("data-event-state", "block");
    await expect(block).toHaveCSS("border-top-style", "dashed");
    await expect(block).toContainText("Break");

    // Empty seats: amber on the bar and count, never on the surface.
    await expect(short.locator("[data-fill-tone]")).toHaveAttribute(
      "data-fill-tone",
      "warning"
    );
    await expect(short).toContainText("3/6");
    await expect(next.locator("[data-fill-tone]")).toHaveAttribute(
      "data-fill-tone",
      "current"
    );
    // A finished class never goes amber even when it was short.
    await expect(past.locator("[data-fill-tone]")).toHaveAttribute(
      "data-fill-tone",
      "current"
    );

    // Recurring glyph is announced.
    await expect(past.getByLabel("Recurring")).toBeVisible();

    // Every card is a real button with an accessible name.
    await expect(
      page.getByRole("button", { name: /Short Session, 23:51 – 23:59/ })
    ).toBeVisible();
  });

  test("US-246-3: the week strip shows up to three dots per day, in start order, and no chips", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await page.goto("/calendar");

    const todayColumn = page.getByTestId(`calendar-day-${TODAY}`);
    await expect(todayColumn).toHaveAttribute("aria-pressed", "true");

    const dots = todayColumn.locator("[data-testid='day-fill-dot']");
    await expect(dots).toHaveCount(3);
    expect(
      await dots.evaluateAll((els) => els.map((e) => e.getAttribute("data-event-title")))
    ).toEqual(["Finished Session", "Canceled Session", "Almoço"]);
    // Dots, not chips: no class title is rendered inside the strip.
    await expect(todayColumn).not.toContainText("Finished Session");
    await expect(page.getByText(/^\+\d+$/)).toHaveCount(0);

    // Selected-day header: navy circle with the day number and the full date.
    const header = page.getByRole("heading", { level: 3 });
    await expect(header).toContainText(format(new Date(), "d"));
    await expect(page.getByText("5 classes")).toBeVisible();
  });

  test("US-246-4: no legend on the phone, FABs for both add actions", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await page.goto("/calendar");

    await expect(page.getByTestId("calendar-view-day")).toBeVisible();
    await expect(page.getByTestId("calendar-legend")).toHaveCount(0);
    await expect(page.getByTestId("calendar-add-event")).toBeVisible();
    await expect(page.getByTestId("calendar-add-class")).toBeVisible();

    // Desktop keeps the toolbar and its legend.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByTestId("calendar-legend")).toBeVisible();
    await expect(page.getByTestId("calendar-view-day")).toHaveCount(0);
  });

  test("US-246-5: a student gets the same view, read-only", async ({ page }) => {
    await loginAsStudent(page);
    await mockCalendar(page);
    await page.goto("/calendar");

    await expect(page.getByTestId("calendar-view-day")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByTestId("calendar-add-event")).toBeVisible();
    await expect(page.getByTestId("calendar-add-class")).toHaveCount(0);
  });
});
