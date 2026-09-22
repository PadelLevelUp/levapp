import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui } from "../helpers/i18n";

// PAD-388 / players.edit rule 4 (B-136 step 3): a coach can DELETE a note about a
// player, not only overwrite it. The web sheet used to drop an emptied box from
// the body (`|| undefined`), so the server never saw a clear; it now sends null.
// By test id and by the request body and the server's own answer — never rendered copy.

async function coachToken(request: APIRequestContext): Promise<string> {
  const login = await request.post(`${API_AUTH}/login`, {
    data: { username: COACH_USERNAME, password: COACH_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return body.accessToken ?? body.access_token;
}

async function studentNotes(request: APIRequestContext, token: string): Promise<string | null> {
  const res = await request.get(`${API_APP}/coach_players`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const players: { name: string; notes: string | null }[] = Array.isArray(data) ? data : data.items;
  const student = players.find((p) => p.name === "E2E Student");
  expect(student, "E2E Student is on the roster").toBeTruthy();
  return student!.notes ?? null;
}

// R-040: E2E Student is SEEDED with the note "E2E test player"; put it back after the test.
test.afterEach(async ({ request }) => {
  const token = await coachToken(request);
  const res = await request.get(`${API_APP}/coach_players`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const players: { name: string; notes: string | null }[] = Array.isArray(data) ? data : data.items;
  const student = players.find((p) => p.name === "E2E Student");
  if (student && student.notes !== "E2E test player") {
    const put = await request.post(`${API_APP}/edit_player`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { player: student, updates: { notes: "E2E test player" } },
    });
    expect.soft(put.ok(), "the seeded note is back").toBeTruthy();
  }
});

test("US-388a: emptying the notes box deletes the note — the body says null and the server agrees", async ({
  page,
  request,
}) => {
  const token = await coachToken(request);
  await loginAsCoach(page);
  await openPlayers(page);
  await page.getByPlaceholder(/search/i).first().fill("E2E Student");
  await page.getByText("E2E Student", { exact: true }).click();
  await page.waitForURL(/\/players\/\d+/, { timeout: 5000 });

  // Give the player a note first, through the same sheet (R-040: the spec puts back what it changes).
  await page.getByRole("button", { name: ui("common.edit") }).first().click({ timeout: 5000 });
  const notes = page.getByTestId("player-notes");
  await notes.fill("E2E note to be deleted");
  const wrote = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/edit_player"));
  await page.getByRole("button", { name: ui("common.save") }).click();
  expect((await wrote).postDataJSON().updates.notes).toBe("E2E note to be deleted");
  await expect.poll(() => studentNotes(request, token)).toBe("E2E note to be deleted");

  // Now empty it. The body carries `notes: null` — an omitted key would mean keep.
  await page.getByRole("button", { name: ui("common.edit") }).first().click({ timeout: 5000 });
  await notes.fill("");
  const cleared = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/edit_player"));
  const answered = page.waitForResponse((r) => r.url().endsWith("/edit_player"));
  await page.getByRole("button", { name: ui("common.save") }).click();
  const body = (await cleared).postDataJSON();
  expect(body.updates).toHaveProperty("notes", null);
  expect((await answered).status()).toBe(200);

  await expect.poll(() => studentNotes(request, token)).toBeNull();
  await page.reload();
  await expect(page.getByTestId("player-side-badge").first()).toBeVisible(); // the page is back
  await expect(page.getByTestId("player-notes")).toHaveCount(0); // the notes block hides when there is none
});
