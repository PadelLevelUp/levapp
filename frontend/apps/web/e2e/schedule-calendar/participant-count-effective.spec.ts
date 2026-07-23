import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const API_BASE = "http://localhost:5001/api/app";
const AUTH_BASE = "http://localhost:5001/api/auth";

/**
 * PAD-71 — the weekly calendar's `X/Y` participant badge must show EFFECTIVE
 * filled spots (enrolled minus declined), not the raw enrolment count, and it
 * must match the "capacity" field inside the class detail sheet.
 *
 * Seed fixture: "E2E Declined Count Class" (next Thursday 16:00) has 4 spots and
 * 3 enrolled players, 2 of whom declined (presence.status == "absent").
 * Expected on BOTH surfaces: 1/4.
 */

const CLASS_TITLE = "E2E Declined Count Class";
const EXPECTED_COUNT = "1/4";

/** Dedicated class so the no-decline assertion can't be shifted by other specs. */
const NO_DECLINE_CLASS_TITLE = "E2E Full Count Class";

type ClassRef = { model: string; originalId: number; date: string };

const createdClasses: ClassRef[] = [];

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, {
    data: { username, password },
  });
  expect(res.ok(), `Login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function coachPlayers(
  request: APIRequestContext,
  coachToken: string
): Promise<Array<{ playerId: number; name: string }>> {
  const res = await request.get(`${API_BASE}/coach_players`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  expect(res.ok(), `coach_players failed: ${res.status()}`).toBeTruthy();
  return res.json();
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

/** Non-recurring class with the given players enrolled and nobody declined. */
async function createNoDeclineClass(
  request: APIRequestContext,
  coachToken: string,
  playerIds: number[]
): Promise<ClassRef> {
  const date = nextMondayDate();
  const res = await request.post(`${API_BASE}/add_class`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: {
      name: NO_DECLINE_CLASS_TITLE,
      classType: "academy",
      maxPlayers: 4,
      date,
      startTime: "19:00",
      endTime: "20:00",
      playerIds,
      isRecurring: false,
      notificationsEnabled: false,
    },
  });
  expect(
    res.ok(),
    `Failed to create no-decline test class: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
  const created = await res.json();
  const ref: ClassRef = {
    model: created.model ?? "Lesson",
    originalId: created.originalId,
    date,
  };
  createdClasses.push(ref);
  return ref;
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
});

test.afterEach(async ({ request }) => {
  if (createdClasses.length === 0) return;
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  while (createdClasses.length > 0) {
    const event = createdClasses.pop()!;
    await request
      .post(`${API_BASE}/remove_class`, {
        headers: { Authorization: `Bearer ${coachToken}` },
        data: { event, scope: "single" },
      })
      .catch(() => null);
  }
});

test("PAD-71: calendar event card excludes declined students from the participant count", async ({
  page,
}) => {
  const found = await findClassOnCalendar(page, CLASS_TITLE);
  expect(found).toBe(true);

  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: CLASS_TITLE })
    .first();
  await expect(card).toBeVisible({ timeout: 5000 });

  // 3 enrolled, 2 declined, 4 spots → 1/4 (NOT 3/4).
  await expect(card).toContainText(EXPECTED_COUNT);
  await expect(card).not.toContainText("3/4");
});

test("PAD-71: calendar count matches the class detail capacity field", async ({
  page,
}) => {
  const found = await findClassOnCalendar(page, CLASS_TITLE);
  expect(found).toBe(true);

  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: CLASS_TITLE })
    .first();
  await expect(card).toContainText(EXPECTED_COUNT);

  await card.click();

  // The detail sheet's "Capacity" tile renders the same effective value.
  const capacityLabel = page.getByText(/^capacity$/i).first();
  await expect(capacityLabel).toBeVisible({ timeout: 10_000 });

  const capacityTile = capacityLabel.locator("xpath=ancestor::div[1]/..");
  await expect(capacityTile).toContainText(EXPECTED_COUNT);
});

test("PAD-71: classes with no declines still show the full enrolment count", async ({
  page,
  request,
}) => {
  // A DEDICATED class — 2 enrolled players, neither of whom has responded.
  // An unanswered invite still occupies a spot, so the badge must show the
  // full enrolment: 2/4, proving the badge subtracts declines specifically
  // rather than every not-yet-confirmed player.
  //
  // This deliberately does NOT assert against the seeded "E2E Academy Class":
  // that class is shared mutable state which other specs legitimately drive
  // (notification-engine enrols/declines students on it, and PAD-64's
  // attendance-save marks them present), so its effective count depends on
  // which specs ran first. Same reasoning as PAD-72's dedicated guest-list
  // class. Filler players are used because only pagination/search specs
  // reference them.
  const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");
  const players = await coachPlayers(request, coachToken);
  const enrollees = players
    .filter((p) => /^Filler Player (26|27)$/.test(p.name))
    .slice(0, 2);
  expect(enrollees, "seeded filler players must exist").toHaveLength(2);

  await createNoDeclineClass(
    request,
    coachToken,
    enrollees.map((p) => p.playerId)
  );

  // The class was created after the page loaded — refetch the calendar.
  await page.reload();

  const found = await findClassOnCalendar(page, NO_DECLINE_CLASS_TITLE);
  expect(found).toBe(true);

  const card = page
    .getByTestId("calendar-event-card")
    .filter({ hasText: NO_DECLINE_CLASS_TITLE })
    .first();
  await expect(card).toContainText("2/4");
  await expect(card).not.toContainText("0/4");
});
