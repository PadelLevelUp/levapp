import { test, expect, type Page } from "@playwright/test";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { loginAsCoach } from "../helpers/auth";

/**
 * PAD-248 — calendar.mobile-views rules 15–17 (Mês) and the rule 18 FAB
 * clearance, on web at phone widths.
 *
 * Everything is relative to the current month, because the calendar opens on
 * today. The calendar API is intercepted: the 10th has a class and a block,
 * the 15th has four events (so its cell shows the three-dot cap), and today
 * has six classes for the FAB-clearance case. The seeded coach's language is
 * English, so labels are asserted in English.
 *
 * Criteria covered: "Month grid dims other months and marks days", "Month
 * paging refetches and reselects", "Labels follow the language", "Floating
 * add buttons never hide the last card".
 */
const TODAY = new Date();
const MONTH = startOfMonth(TODAY);
const k = (d: Date) => format(d, "yyyy-MM-dd");
const D10 = k(addDays(MONTH, 9));
const D15 = k(addDays(MONTH, 14));

function gridOf(month: Date) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return { start, end, days };
}

const cls = (id: string, date: string, startTime: string, endTime: string, color = "#0D9488") => ({
  id,
  model: "LessonInstance",
  originalId: Number(id.replace(/\D/g, "")) || 1,
  type: "class",
  isRecurring: false,
  title: `Class ${id}`,
  date,
  startTime,
  endTime,
  color,
  classType: "academy",
  status: "scheduled",
  participantCount: 6,
  maxPlayers: 6,
});

const MONTH_EVENTS = [
  cls("class-3001", D10, "10:00", "11:30"),
  {
    id: "block-301",
    model: "CalendarBlock",
    originalId: 301,
    type: "block",
    isRecurring: false,
    title: "Almoço",
    date: D10,
    startTime: "12:00",
    endTime: "13:00",
    blockType: "break",
  },
  cls("class-3002", D15, "09:00", "10:00", "#6366F1"),
  cls("class-3003", D15, "10:00", "11:00", "#1355DC"),
  cls("class-3004", D15, "11:00", "12:00", "#0891B2"),
  cls("class-3005", D15, "12:00", "13:00", "#A21CAF"),
];

// Six classes today, late in the day so they render as upcoming.
const TODAY_EVENTS = Array.from({ length: 6 }, (_, i) =>
  cls(`class-40${i}`, k(TODAY), `${String(17 + i).padStart(2, "0")}:00`, `${String(17 + i).padStart(2, "0")}:45`)
);

async function mockCalendar(page: Page, events: unknown[], requests?: URL[]) {
  await page.route("**/app/calendar**", (route) => {
    requests?.push(new URL(route.request().url()));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(events),
    });
  });
}

async function openMonth(page: Page) {
  await page.goto("/calendar");
  await page.getByTestId("calendar-view-month").click();
  await expect(page.getByTestId("calendar-month-grid")).toBeVisible();
}

test.describe("PAD-248: phone calendar Mês view", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("US-248-1: the Mês segment is enabled, shows the month and survives a reload", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page, MONTH_EVENTS);
    await page.goto("/calendar");

    const month = page.getByTestId("calendar-view-month");
    await expect(month).not.toHaveAttribute("aria-disabled", "true");
    await month.click();
    await expect(month).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(format(MONTH, "MMMM yyyy"));

    await page.reload();
    await expect(page.getByTestId("calendar-view-month")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("calendar-month-grid")).toBeVisible();
  });

  test("US-248-2: the grid dims other months, marks days with up to three dots", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page, MONTH_EVENTS);
    await openMonth(page);

    const { days } = gridOf(MONTH);
    await expect(page.locator("[data-testid^='calendar-month-cell-']")).toHaveCount(days.length);

    const outside = days.find((d) => !isSameMonth(d, MONTH));
    if (outside) {
      const cell = page.getByTestId(`calendar-month-cell-${k(outside)}`);
      await expect(cell).toHaveAttribute("data-in-month", "false");
      await expect(cell).toBeDisabled();
      await expect(cell).toHaveCSS("opacity", "0.32");
    }

    const d10 = page.getByTestId(`calendar-month-cell-${D10}`);
    await expect(d10).toHaveAttribute("data-in-month", "true");
    await expect(d10.locator("[data-testid='day-fill-dot']")).toHaveCount(2);
    // Four events, three dots.
    await expect(
      page.getByTestId(`calendar-month-cell-${D15}`).locator("[data-testid='day-fill-dot']")
    ).toHaveCount(3);
  });

  test("US-248-3: tapping a day selects it and shows its single-day grid and sheet", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page, MONTH_EVENTS);
    await openMonth(page);

    const d10 = page.getByTestId(`calendar-month-cell-${D10}`);
    await d10.click();
    await expect(d10).toHaveAttribute("aria-pressed", "true");

    const grid = page.getByTestId("calendar-time-grid");
    await expect(grid.locator("[data-testid^='calendar-grid-column-']")).toHaveCount(1);
    await expect(page.getByTestId(`calendar-grid-column-${D10}`)).toBeVisible();
    // Rule 17: the range comes from the selected day's events (10:00–13:00 → 09–14).
    await expect(grid).toHaveAttribute("data-hour-start", "9");
    await expect(grid).toHaveAttribute("data-hour-end", "14");
    await expect(
      grid.locator("[data-testid='calendar-grid-block'][data-event-id='class-3001']")
    ).toBeVisible();

    const sheet = page.getByTestId("calendar-day-sheet");
    await expect(sheet.getByRole("heading", { level: 3 })).toContainText(
      format(addDays(MONTH, 9), "EEEE, d MMMM")
    );
    await expect(sheet.getByTestId("calendar-event-card")).toHaveCount(2);

    // The one selected day follows into Dia.
    await page.getByTestId("calendar-view-day").click();
    await expect(page.getByTestId(`calendar-day-${D10}`)).toHaveAttribute("aria-pressed", "true");
  });

  test("US-248-4: paging selects the next month's 1st and fetches its six-week range", async ({
    page,
  }) => {
    const requests: URL[] = [];
    await loginAsCoach(page);
    await mockCalendar(page, MONTH_EVENTS, requests);
    await openMonth(page);

    const next = addMonths(MONTH, 1);
    const nextGrid = gridOf(next);
    requests.length = 0;
    await page.getByTestId("calendar-month-next").click();

    await expect(page.getByRole("heading", { level: 2 })).toHaveText(format(next, "MMMM yyyy"));
    await expect(page.getByTestId(`calendar-month-cell-${k(next)}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect
      .poll(() =>
        requests.some(
          (u) =>
            (u.searchParams.get("from") ?? "").startsWith(k(nextGrid.start)) &&
            (u.searchParams.get("to") ?? "").startsWith(k(nextGrid.end))
        )
      )
      .toBe(true);

    await page.getByTestId("calendar-month-prev").click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(format(MONTH, "MMMM yyyy"));
    await expect(page.getByTestId(`calendar-month-cell-${k(TODAY)}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("US-248-5: the floating add buttons never hide the last card, in Dia, Semana and Mês", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page, TODAY_EVENTS);
    await page.goto("/calendar");

    const lastCardClearsButtons = async (listTestId: string) => {
      const list = page.getByTestId(listTestId);
      await expect(list.getByTestId("calendar-event-card")).toHaveCount(6);
      await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.waitForTimeout(150);
      const last = await list.getByTestId("calendar-event-card").last().boundingBox();
      const addEvent = await page.getByTestId("calendar-add-event").boundingBox();
      const addClass = await page.getByTestId("calendar-add-class").boundingBox();
      expect(last && addEvent && addClass).toBeTruthy();
      expect(last!.y + last!.height).toBeLessThanOrEqual(addEvent!.y);
      expect(last!.y + last!.height).toBeLessThanOrEqual(addClass!.y);
    };

    await lastCardClearsButtons("calendar-day-list");

    await page.getByTestId("calendar-view-week").click();
    await lastCardClearsButtons("calendar-sheet-list");

    await page.getByTestId("calendar-view-month").click();
    await lastCardClearsButtons("calendar-sheet-list");
  });

  // Rule 18 (coordinator decision 2026-09-10): in Mês the add buttons step
  // aside while the sheet is dragged above its resting height.
  test("US-248-6: in Mês the add buttons hide while the sheet is pulled up, and come back", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page, MONTH_EVENTS);

    const dragHandleBy = async (dy: number) => {
      const box = (await page.getByTestId("calendar-sheet-handle").boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy, { steps: 8 });
      await page.mouse.up();
    };
    const addEvent = page.getByTestId("calendar-add-event");
    const addClass = page.getByTestId("calendar-add-class");

    await openMonth(page);
    // At its resting height the buttons are there.
    await expect(addEvent).toBeVisible();
    await expect(addClass).toBeVisible();

    // Pulled up: both gone.
    await dragHandleBy(-600);
    await expect(addEvent).toHaveCount(0);
    await expect(addClass).toHaveCount(0);

    // Dragged all the way down: both back.
    await dragHandleBy(900);
    await expect(addEvent).toBeVisible();
    await expect(addClass).toBeVisible();

    // Pulled up again, then leaving Mês brings them back.
    await dragHandleBy(-600);
    await expect(addEvent).toHaveCount(0);
    await page.getByTestId("calendar-view-day").click();
    await expect(addEvent).toBeVisible();

    // Semana keeps them whatever the sheet does.
    await page.getByTestId("calendar-view-week").click();
    await expect(page.getByTestId("calendar-time-grid")).toBeVisible();
    await dragHandleBy(-600);
    await expect(addEvent).toBeVisible();
    await expect(addClass).toBeVisible();
  });

  // PAD-286 — rule 17: "The Mês sheet rises past half of the screen".
  test("US-286-1: the Mês sheet rises over the month grid past half of the screen, and back down", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page, MONTH_EVENTS);
    await openMonth(page);

    const sheet = page.getByTestId("calendar-day-sheet");
    const monthGrid = page.getByTestId("calendar-month-grid");
    const addEvent = page.getByTestId("calendar-add-event");
    const dragHandleBy = async (dy: number) => {
      const box = (await page.getByTestId("calendar-sheet-handle").boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy, { steps: 8 });
      await page.mouse.up();
    };

    const gridBox = (await monthGrid.boundingBox())!;
    const resting = (await sheet.boundingBox())!;
    // At rest the sheet sits over the day grid, below the month grid.
    expect(resting.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);

    // Dragged up past the maximum it stops one hour row (44px) below the top of
    // the month grid and is taller than half of the 844px viewport.
    await dragHandleBy(-900);
    const raised = (await sheet.boundingBox())!;
    expect(raised.height).toBeGreaterThan(844 / 2);
    expect(Math.abs(raised.y - (gridBox.y + 44))).toBeLessThanOrEqual(1);
    // The weekday header row (30px, MONTH_WEEKDAY_HEADER_HEIGHT) stays fully visible.
    expect(raised.y).toBeGreaterThanOrEqual(gridBox.y + 30);
    await expect(addEvent).toHaveCount(0);

    // All the way down: the month grid is uncovered and the buttons are back.
    await dragHandleBy(900);
    const lowered = (await sheet.boundingBox())!;
    expect(lowered.y).toBeGreaterThanOrEqual(gridBox.y + gridBox.height - 1);
    await expect(addEvent).toBeVisible();
  });

});
