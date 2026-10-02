import { test, expect } from "@playwright/test";
import {
  COACH_NOLEVELS_PASSWORD,
  COACH_NOLEVELS_USERNAME,
  loginAsCoach,
  STUDENT3_PASSWORD,
  STUDENT3_USERNAME,
  STUDENT_PASSWORD,
  STUDENT_USERNAME,
} from "../helpers/auth";
import { openMessages } from "../helpers/navigation";
import { ui } from "../helpers/i18n";
import { API_APP, API_AUTH } from "../helpers/api";

/**
 * B-267 / PAD-483 — messaging.conversations rule 7.
 *
 * A student's picker lists only coaches they are linked to (roster, shared club, a class the
 * coach teaches). The seed puts `e2e-coach-nolevels` in the coach's club but no student in that
 * club and none on its roster, so for `e2e-student` it is an unlinked coach: absent from the
 * picker, refused on `otherParticipants`, still reachable by exact username.
 *
 * When the server refuses a picked row (a stale list), the dialog says why and stays open
 * instead of closing on nothing. The refusal is forced with a route stub: any role's picker
 * takes the same path, and the coach's picker is the one with rows on a fresh seed.
 */

async function tokenFor(
  request: import("@playwright/test").APIRequestContext,
  username: string,
  password: string
) {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

test("B-267: a student's picker holds linked coaches only", async ({ request }) => {
  const headers = {
    Authorization: `Bearer ${await tokenFor(request, STUDENT_USERNAME, STUDENT_PASSWORD)}`,
  };
  const users = await (await request.get(`${API_APP}/messageable-users`, { headers })).json();
  const usernames = users.map((u: { username?: string }) => u.username);
  expect(usernames).toContain("e2e-coach");
  expect(usernames).not.toContain(COACH_NOLEVELS_USERNAME);
});

test("B-267: an unlinked coach is refused by id and reachable by exact username", async ({
  request,
}) => {
  // e2e-student-3 has no roster, club or class link to anyone (seed.py, PAD-215), and no other
  // spec opens a thread between it and the no-levels coach, so this is a first contact.
  const coachHeaders = {
    Authorization: `Bearer ${await tokenFor(request, COACH_NOLEVELS_USERNAME, COACH_NOLEVELS_PASSWORD)}`,
  };
  const coach = await (await request.get(`${API_AUTH}/me`, { headers: coachHeaders })).json();
  const coachId = String(coach.id ?? coach.user?.id);

  const headers = {
    Authorization: `Bearer ${await tokenFor(request, STUDENT3_USERNAME, STUDENT3_PASSWORD)}`,
  };
  const byId = await request.post(`${API_APP}/conversation`, {
    headers,
    data: { otherParticipants: [coachId] },
  });
  expect(byId.status()).toBe(403);

  const byName = await request.post(`${API_APP}/conversation`, {
    headers,
    data: { otherUsername: COACH_NOLEVELS_USERNAME },
  });
  expect(byName.status()).toBeLessThan(400);
});

test("B-267: a refused picker row explains itself and keeps the dialog open", async ({ page }) => {
  await loginAsCoach(page);
  await openMessages(page);

  await page.route("**/api/app/conversation", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ message: "You are not allowed to message this user" }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: ui("messages.newConversation") }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  const row = page.getByTestId("new-conversation-row").first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();

  const error = page.getByTestId("new-conversation-picker-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveText(ui("messages.cannotMessageUser"));
  await expect(page.getByRole("dialog")).toBeVisible();
});
