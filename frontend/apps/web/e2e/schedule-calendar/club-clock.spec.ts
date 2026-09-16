import { test, expect, type Page } from "@playwright/test";
import { format } from "date-fns";
import { loginAsCoach } from "../helpers/auth";

/**
 * PAD-295 / B-066 — calendar.view rule 16, criterion "Past and next are judged
 * on the club's clock on any device". The browser runs in Asia/Tokyo (UTC+9,
 * eight or nine hours ahead of Lisbon); the calendar API is mocked with two
 * classes on the club's today, one that ended earlier and one still ahead,
 * built from the club's clock. Device-time code reads both as past.
 */
function lisbonNow(): Date {
  // A local Date carrying Lisbon's wall clock — the same idea as @levelup/config's
  // lisbonNow, written out so the test does not depend on the code under test.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
}

const cls = (id: string, date: string, startTime: string, endTime: string, title: string) => ({
  id,
  model: "LessonInstance",
  originalId: Number(id.replace(/\D/g, "")),
  type: "class",
  isRecurring: false,
  title,
  date,
  startTime,
  endTime,
  color: "#0D9488",
  classType: "academy",
  status: "scheduled",
  participantCount: 6,
  maxPlayers: 6,
});

async function mockCalendar(page: Page, events: unknown[]) {
  await page.route("**/app/calendar**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(events) })
  );
}

test.describe("PAD-295: the calendar judges past and next on the club's clock", () => {
  test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });

  test("US-295-1: a class ahead on the club's clock is next, one behind is past, in Tokyo", async ({
    page,
  }) => {
    const now = lisbonNow();
    const today = format(now, "yyyy-MM-dd");
    const hm = (d: Date) => format(d, "HH:mm");
    const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
    // Keep both classes inside the club's today: the "ahead" class needs ~90 min
    // of runway before midnight, the "behind" class ~90 min since midnight.
    const aheadFits = now.getHours() < 22 || (now.getHours() === 22 && now.getMinutes() < 30);
    const behindFits = now.getHours() > 1 || (now.getHours() === 1 && now.getMinutes() > 30);
    const events = [
      ...(behindFits ? [cls("class-9001", today, hm(minutes(-90)), hm(minutes(-30)), "Behind Us")] : []),
      ...(aheadFits ? [cls("class-9002", today, hm(minutes(30)), hm(minutes(90)), "Ahead Of Us")] : []),
    ];
    test.skip(events.length === 0, "both classes would cross the club's midnight");

    await loginAsCoach(page);
    await mockCalendar(page, events);
    await page.goto("/calendar");
    // Dia: the strip must land on the club's today, and its column is selectable.
    const todayColumn = page.getByTestId(`calendar-day-${today}`);
    await expect(todayColumn).toBeVisible();
    await todayColumn.click();

    const card = (title: string) =>
      page.getByTestId("calendar-event-card").filter({ hasText: title });
    if (behindFits) await expect(card("Behind Us")).toHaveAttribute("data-event-state", "past");
    if (aheadFits) await expect(card("Ahead Of Us")).toHaveAttribute("data-event-state", "next");
  });
});
