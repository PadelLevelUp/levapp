/**
 * PAD-130 (eligibility.open-spot-visibility rules 1–3, 6, 10–11): when the
 * coach makes empty spots visible, an eligible student sees a class they are
 * not in as an "open spot" card in their own calendar; turning the setting
 * off takes it away again.
 *
 * Seed facts: "E2E Pending Confirm Class" is B1, tomorrow 18:00, max 6 with two
 * pending fillers, and e2e-student (B1, on e2e-coach's roster) is NOT in it.
 * The coach setting is restored in `finally`.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsStudent } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { openCalendar } from "../helpers/navigation";
import { findClassOnCalendar } from "../helpers/calendar-navigation";

const CLASS = "E2E Pending Confirm Class";

async function coachToken(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

test("PAD-130: an eligible student sees the coach's open spot, and only while the coach shows it", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const token = await coachToken(request);
  const auth = { Authorization: `Bearer ${token}` };
  const setVisible = async (openSpotsVisible: boolean) => {
    const res = await request.post(`${API_ROOT}/app/notify/config`, { headers: auth, data: { openSpotsVisible } });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).openSpotsVisible).toBe(openSpotsVisible);
  };

  await setVisible(true);
  try {
    await loginAsStudent(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS), "open spot in the student's calendar").toBe(true);
    const card = page.locator('[data-open-spot="true"]', { hasText: CLASS }).first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("calendar-open-spot-chip")).toBeVisible();

    // Rule 6: the switch off takes the offer away on the next read.
    await setVisible(false);
    await page.reload();
    await openCalendar(page);
    expect(await findClassOnCalendar(page, CLASS, 2)).toBe(false);
  } finally {
    await setVisible(false);
  }
});
