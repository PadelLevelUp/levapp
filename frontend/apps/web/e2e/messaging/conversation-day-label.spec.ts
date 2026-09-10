import { test, expect } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";

// PAD-98: the chat conversation list (left panel) must show the DAY, not only
// the time. Seed creates a second conversation (coach <-> "E2E Student Three")
// whose last message is dated yesterday, so its list row must render a
// "Yesterday" day label instead of a bare time like "12:00".
// The e2e-coach UI renders in English, so the label is "Yesterday".
//
// Uses student 3, not student 2: student 3 has no coach/club (PAD-215
// fixture), so no notification-engine spec ever sends it a real message mid-
// run — which would otherwise bump this conversation's last message to
// "today" and fail this assertion depending on run order (test-health,
// 2026-09-09).

// PAD-253: "Yesterday" is decided against the BROWSER clock, while the seed
// dates the message to yesterday noon UTC. Between local midnight and 01:00
// (Lisbon summer time) that message is two local days old and the row read a
// weekday instead. The test reads the row's own lastMessageAt from the API and
// pins the browser clock to exactly one day after it, so the label is
// "Yesterday" whenever the suite runs — and still is if a later spec writes
// into this thread first.
const PARTNER = "E2E Student Three";

test("US-98: conversation list shows a day label for older conversations", async ({
  page,
  request,
}) => {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  const auth = await login.json();
  const token = (auth.accessToken ?? auth.access_token) as string;
  const res = await request.get(`${API_APP}/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  const { conversations } = await res.json();
  const row = conversations.find(
    (c: { participantName?: string | null }) => c.participantName === PARTNER
  );
  expect(row?.lastMessageAt, `the seeded conversation with "${PARTNER}" must have a last message`).toBeTruthy();
  await page.clock.setFixedTime(new Date(Date.parse(row.lastMessageAt) + 24 * 3600 * 1000));

  await loginAsCoach(page);
  await openMessages(page);

  // Wait for the conversation list to load.
  await expect(page.getByText("E2E Student").first()).toBeVisible({ timeout: 5000 });

  // The yesterday-dated conversation row.
  const yesterdayRow = page.locator("button", { hasText: PARTNER });
  await expect(yesterdayRow).toBeVisible({ timeout: 5000 });

  // Its timestamp must be the day label, not just a time.
  await expect(yesterdayRow.getByText(/^Yesterday$/)).toBeVisible();
});
