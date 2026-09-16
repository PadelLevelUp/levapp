import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * PAD-335 (`classes.delete` rules 5 and 7, B-096): deleting a one-off class
 * whose attendance was confirmed must delete the class — not just the
 * `LessonInstance` that confirming attendance materialised.
 *
 * The bug: after the confirm and any calendar refetch, the card carried
 * `model=LessonInstance`; `remove_class` deleted that instance alone and the
 * parent `Lesson` re-projected the occurrence on the next fetch with
 * `confirmedCount: 0` — the class came back and the register was gone, while
 * the API had said 200 `deleted`.
 *
 * The class is created through the API (two seeded students enrolled); the
 * attendance, the refetch and the delete go through the UI; the final assertion
 * is the server's own calendar payload, not the grid.
 */

const TITLE = "PAD-335 Delete After Attendance";

async function token(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** Next Monday as YYYY-MM-DD (same logic as the seed script). */
function nextMondayDate(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function calendarEventsOn(
  request: APIRequestContext,
  auth: Record<string, string>,
  day: string
): Promise<Array<{ title: string; model: string; confirmedCount: number }>> {
  const res = await request.get(
    `${API_APP}/calendar?from=${day}T00:00:00&to=${day}T23:59:59`,
    { headers: auth }
  );
  expect(res.ok(), `calendar failed: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  const events = Array.isArray(json) ? json : json.events ?? [];
  return events.filter((e: { title: string }) => e.title === TITLE);
}

async function openClass(page: Page): Promise<void> {
  const found = await findClassOnCalendar(page, TITLE);
  expect(found, `expected "${TITLE}" on the calendar`).toBe(true);
  await page.getByText(TITLE).first().click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /delete class/i }).first()
  ).toBeVisible({ timeout: 5000 });
}

test.describe("PAD-335: a deleted one-off with confirmed attendance stays deleted", () => {
  let auth: Record<string, string>;
  let date: string;

  test.beforeEach(async ({ page, request }) => {
    auth = { Authorization: `Bearer ${await token(request)}` };
    date = nextMondayDate();

    const playersRes = await request.get(`${API_APP}/coach_players`, { headers: auth });
    expect(playersRes.ok()).toBeTruthy();
    const players: Array<{ playerId: number }> = await playersRes.json();
    const playerIds = players.slice(0, 2).map((p) => p.playerId);
    expect(playerIds.length, "the seed gives the coach at least two players").toBe(2);

    const created = await request.post(`${API_APP}/add_class`, {
      headers: auth,
      data: {
        name: TITLE,
        classType: "academy",
        maxPlayers: 4,
        date,
        startTime: "07:00",
        endTime: "08:00",
        playerIds,
        isRecurring: false,
        notificationsEnabled: false,
      },
    });
    expect(created.ok(), `add_class failed: ${created.status()} ${await created.text()}`).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsCoach(page);
    await openCalendar(page);
  });

  test.afterEach(async ({ request }) => {
    // Best-effort cleanup if the assertion failed and the class survived.
    for (const e of await calendarEventsOn(request, auth, date)) {
      const ev = e as unknown as { model: string; originalId: number; date: string };
      await request.post(`${API_APP}/remove_class`, {
        headers: auth,
        data: { event: { model: ev.model, originalId: ev.originalId, date: ev.date }, scope: "single" },
      });
    }
  });

  test("PAD-335: delete after confirmed attendance removes the class from the calendar payload", async ({
    page,
    request,
  }) => {
    // 1. Mark both participants present and confirm — this materialises the instance.
    await openClass(page);
    await page.getByRole("button", { name: /mark attendance|edit attendance/i }).first().click();
    const presentButtons = page.getByRole("button", { name: /^present$/i });
    await expect(presentButtons).toHaveCount(2, { timeout: 5000 });
    await presentButtons.nth(0).click();
    await presentButtons.nth(1).click();
    const [confirmResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/app\/class_instance\/presences\/confirm$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 10_000 }
      ),
      page.getByRole("button", { name: /^confirm$/i }).click(),
    ]);
    expect(confirmResp.status()).toBe(200);
    await page.keyboard.press("Escape");

    // 2. A refetch: the card now resolves to the materialised instance.
    await page.reload();
    await openCalendar(page);
    const afterConfirm = await calendarEventsOn(request, auth, date);
    expect(afterConfirm).toHaveLength(1);
    expect(afterConfirm[0].model).toBe("LessonInstance");
    expect(afterConfirm[0].confirmedCount).toBe(2);

    // 3. Delete the class. The dialog says the register goes with it (rule 7).
    await openClass(page);
    await page.getByRole("dialog").getByRole("button", { name: /delete class/i }).first().click();
    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await expect(confirmDialog.getByTestId("delete-attendance-note")).toBeVisible();
    const [removeResp] = await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/app\/remove_class$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 10_000 }
      ),
      confirmDialog.getByRole("button", { name: /^delete$/i }).click(),
    ]);
    expect(removeResp.status()).toBe(200);
    expect(await removeResp.json()).toEqual({ status: "deleted" });

    // 4. Another refetch: the server's own view has no such class, in any state.
    await page.reload();
    await openCalendar(page);
    expect(await calendarEventsOn(request, auth, date)).toEqual([]);
    expect(await findClassOnCalendar(page, TITLE, 3)).toBe(false);
  });
});
