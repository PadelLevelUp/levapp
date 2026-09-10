import { test, expect, type Page } from "@playwright/test";
import { addDays, format, startOfWeek } from "date-fns";
import { loginAsCoach } from "../helpers/auth";

/**
 * PAD-247 — calendar.mobile-views, the Semana view on web at phone widths:
 * a time grid of the visible week with a draggable day sheet over it.
 *
 * The calendar API is intercepted so the visible week has a known shape: the
 * earliest start is 09:00 (Monday) and the latest end 18:00 (Friday), so the
 * grid must run 08–19; one class on Tuesday, a block on Wednesday and two
 * overlapping classes on Thursday. Dates are this week's, because the
 * calendar opens on the current week.
 *
 * The seeded coach's language is English, so visible strings are English.
 *
 * Criteria covered: "Segmented control switches modes and remembers the
 * choice", "Selected day is shared across modes", "Week time grid positions
 * events by minutes", "Empty week shows the default range", "Bottom sheet
 * resizes within bounds".
 */
const MONDAY = startOfWeek(new Date(), { weekStartsOn: 1 });
const day = (offset: number) => format(addDays(MONDAY, offset), "yyyy-MM-dd");
const MON = day(0);
const TUE = day(1);
const WED = day(2);
const THU = day(3);
const FRI = day(4);

const MOCK_EVENTS = [
  {
    id: "class-2000",
    model: "LessonInstance",
    originalId: 2000,
    type: "class",
    isRecurring: false,
    title: "Monday Early",
    date: MON,
    startTime: "09:00",
    endTime: "09:30",
    color: "#475569",
    classType: "academy",
    status: "scheduled",
    participantCount: 6,
    maxPlayers: 6,
  },
  {
    id: "block-92",
    model: "CalendarBlock",
    originalId: 92,
    type: "block",
    isRecurring: false,
    title: "Fecho",
    date: FRI,
    startTime: "17:30",
    endTime: "18:00",
    blockType: "off_work",
  },
  {
    id: "class-2001",
    model: "LessonInstance",
    originalId: 2001,
    type: "class",
    isRecurring: false,
    title: "Tuesday Session",
    date: TUE,
    startTime: "10:00",
    endTime: "11:30",
    color: "#0D9488",
    classType: "academy",
    status: "scheduled",
    participantCount: 4,
    maxPlayers: 6,
  },
  {
    id: "block-91",
    model: "CalendarBlock",
    originalId: 91,
    type: "block",
    isRecurring: false,
    title: "Almoço",
    date: WED,
    startTime: "12:00",
    endTime: "13:00",
    blockType: "break",
  },
  {
    id: "class-2002",
    model: "LessonInstance",
    originalId: 2002,
    type: "class",
    isRecurring: false,
    title: "Thursday A",
    date: THU,
    startTime: "15:00",
    endTime: "16:00",
    color: "#6366F1",
    classType: "academy",
    status: "scheduled",
    participantCount: 6,
    maxPlayers: 6,
  },
  {
    id: "class-2003",
    model: "LessonInstance",
    originalId: 2003,
    type: "class",
    isRecurring: false,
    title: "Thursday B",
    date: THU,
    startTime: "15:30",
    endTime: "16:30",
    color: "#1355DC",
    classType: "academy",
    status: "scheduled",
    participantCount: 2,
    maxPlayers: 6,
  },
];

async function mockCalendar(page: Page, events: unknown[] = MOCK_EVENTS) {
  await page.route("**/app/calendar**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(events),
    })
  );
}

async function openWeek(page: Page) {
  await page.goto("/calendar");
  await page.getByTestId("calendar-view-week").click();
  await expect(page.getByTestId("calendar-time-grid")).toBeVisible();
}

test.describe("PAD-247: phone calendar Semana view", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("US-247-1: the Semana segment is enabled and the choice survives a reload", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await page.goto("/calendar");

    const week = page.getByTestId("calendar-view-week");
    await expect(week).not.toHaveAttribute("aria-disabled", "true");
    await week.click();
    await expect(week).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("calendar-time-grid")).toBeVisible();
    await expect(page.getByTestId("calendar-today")).toBeVisible();
    // Mês still waits for PAD-248.
    await expect(page.getByTestId("calendar-view-month")).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    await page.reload();
    await expect(page.getByTestId("calendar-view-week")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page.getByTestId("calendar-time-grid")).toBeVisible();
  });

  test("US-247-2: hours run 08–19 and blocks are positioned by minutes, overlaps side by side", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await openWeek(page);

    const grid = page.getByTestId("calendar-time-grid");
    await expect(grid).toHaveAttribute("data-hour-start", "8");
    await expect(grid).toHaveAttribute("data-hour-end", "19");
    const rowHeight = Number(await grid.getAttribute("data-row-height"));
    expect(rowHeight).toBeGreaterThan(0);

    const labels = grid.locator("[data-testid='calendar-hour-label']");
    await expect(labels.first()).toHaveText("08");
    await expect(labels.last()).toHaveText("19");

    const tue = grid.locator("[data-testid='calendar-grid-block'][data-event-id='class-2001']");
    await expect(tue).toBeVisible();
    const tueBox = await tue.evaluate((el) => ({
      top: parseFloat((el as HTMLElement).style.top),
      height: parseFloat((el as HTMLElement).style.height),
    }));
    expect(tueBox.top).toBeCloseTo(2 * rowHeight, 5);
    expect(tueBox.height).toBeCloseTo(1.5 * rowHeight, 5);
    // The coach colour is the surface. This week's Tuesday may already be
    // over when the suite runs, in which case the block is the faded teal —
    // never the raw hue, never the muted block treatment.
    const tueState = await tue.getAttribute("data-event-state");
    expect(["scheduled", "next", "past"]).toContain(tueState);
    if (tueState === "past") {
      await expect(tue).not.toHaveCSS("background-color", "rgb(13, 148, 136)");
    } else {
      await expect(tue).toHaveCSS("background-color", "rgb(13, 148, 136)");
    }

    // Two overlapping Thursday classes share the column width.
    const thuA = grid.locator("[data-testid='calendar-grid-block'][data-event-id='class-2002']");
    const thuB = grid.locator("[data-testid='calendar-grid-block'][data-event-id='class-2003']");
    await expect(thuA).toHaveAttribute("data-column", "0");
    await expect(thuB).toHaveAttribute("data-column", "1");
    await expect(thuA).toHaveAttribute("data-columns", "2");
    const [wA, wB, wCol] = await Promise.all([
      thuA.evaluate((el) => el.getBoundingClientRect().width),
      thuB.evaluate((el) => el.getBoundingClientRect().width),
      page
        .getByTestId(`calendar-grid-column-${THU}`)
        .evaluate((el) => el.getBoundingClientRect().width),
    ]);
    expect(wA).toBeCloseTo(wB, 0);
    expect(wA * 2).toBeLessThanOrEqual(wCol + 1);
    expect(wA * 2).toBeGreaterThan(wCol * 0.8);

    // The block is muted, not coloured.
    const almoco = grid.locator("[data-testid='calendar-grid-block'][data-event-id='block-91']");
    await expect(almoco).toHaveAttribute("data-event-state", "block");
  });

  test("US-247-3: tapping a column selects that day, tapping a block opens its detail", async ({
    page,
  }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await openWeek(page);

    // Tap the empty top of Wednesday's column.
    const wedColumn = page.getByTestId(`calendar-grid-column-${WED}`);
    await wedColumn.click({ position: { x: 10, y: 8 } });
    await expect(page.getByTestId(`calendar-day-${WED}`)).toHaveAttribute("aria-pressed", "true");
    await expect(wedColumn).toHaveAttribute("data-selected", "true");
    const sheet = page.getByTestId("calendar-day-sheet");
    await expect(sheet.getByRole("heading", { level: 3 })).toContainText("Wednesday");
    await expect(sheet.getByTestId("calendar-event-card")).toHaveCount(1);
    await expect(sheet.getByTestId("calendar-event-card")).toContainText("Almoço");

    // The selection is the calendar's one selected day: switching to Dia keeps it.
    await page.getByTestId("calendar-view-day").click();
    await expect(page.getByTestId(`calendar-day-${WED}`)).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("calendar-view-week").click();

    // Tapping a class block opens the class detail sheet (not the column
    // select). The sheet fetches the instance on open; the mocked class has
    // no server row, so that call is answered with a matching instance.
    await page.route("**/app/class_instance**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "class-2001",
          originalId: "2001",
          coachId: "1",
          date: TUE,
          startTime: "10:00",
          endTime: "11:30",
          status: "scheduled",
          classType: "academy",
          name: "Tuesday Session",
          color: "#0D9488",
          maxPlayers: 6,
          participants: [],
          presences: [],
          notificationsEnabled: true,
        }),
      })
    );
    await page
      .locator("[data-testid='calendar-grid-block'][data-event-id='class-2001']")
      .click();
    await expect(page.getByRole("dialog")).toContainText("Tuesday Session");
    // The column underneath did not also get selected by the block tap.
    await expect(page.getByTestId(`calendar-day-${WED}`)).toHaveAttribute("aria-pressed", "true");
  });

  test("US-247-4: the day sheet drags within its bounds", async ({ page }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await openWeek(page);

    const sheet = page.getByTestId("calendar-day-sheet");
    const handle = page.getByTestId("calendar-sheet-handle");
    const min = Number(await sheet.getAttribute("data-sheet-min"));
    const max = Number(await sheet.getAttribute("data-sheet-max"));
    const initial = Number(await sheet.getAttribute("data-sheet-top"));
    expect(min).toBeGreaterThan(0);
    expect(initial).toBeGreaterThan(min);
    expect(initial).toBeLessThan(max);

    const box = (await handle.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Drag far past the top: the sheet stops at min (one hour row stays visible).
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 2000, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toHaveAttribute("data-sheet-top", String(min));
    await expect(page.locator("[data-testid='calendar-hour-label']").first()).toBeVisible();

    // Drag far past the bottom: the sheet stops at max (header still visible).
    const box2 = (await handle.boundingBox())!;
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 2000, { steps: 8 });
    await page.mouse.up();
    await expect(sheet).toHaveAttribute("data-sheet-top", String(max));
    await expect(sheet.getByRole("heading", { level: 3 })).toBeVisible();
  });

  test("US-247-5: an empty week shows 08–20", async ({ page }) => {
    await loginAsCoach(page);
    await mockCalendar(page, []);
    await openWeek(page);

    const grid = page.getByTestId("calendar-time-grid");
    await expect(grid).toHaveAttribute("data-hour-start", "8");
    await expect(grid).toHaveAttribute("data-hour-end", "20");
    await expect(page.getByTestId("calendar-day-sheet")).toContainText("No classes scheduled");
  });

  test("US-247-6: Hoje returns to today's week and reselects today", async ({ page }) => {
    await loginAsCoach(page);
    await mockCalendar(page);
    await openWeek(page);

    const todayKey = format(new Date(), "yyyy-MM-dd");
    const label = page.getByRole("heading", { level: 2 });
    const thisWeek = await label.textContent();

    await page.getByTestId("calendar-next-week").click();
    await expect(label).not.toHaveText(thisWeek ?? "");
    await expect(page.getByTestId(`calendar-day-${todayKey}`)).toHaveCount(0);

    await page.getByTestId("calendar-today").click();
    await expect(label).toHaveText(thisWeek ?? "");
    await expect(page.getByTestId(`calendar-day-${todayKey}`)).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
