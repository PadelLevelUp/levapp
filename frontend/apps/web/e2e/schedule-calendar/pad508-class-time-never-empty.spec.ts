/**
 * PAD-508 (classes.create rule 8b, classes.edit rule 7b; B-275): the desktop class-time field never
 * holds an empty time, so it can never "revert to zero" and fail the save.
 *
 * The native time input read "" once a segment was cleared and the sheet used to send it (a 500;
 * B-275 then flagged it instead). The field is now a typeable time with a 15-minute list: clearing it
 * and leaving it — however long — puts the last valid time back. Real key presses, located by test id.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsCoach } from "../helpers/auth";
import { API_ROOT } from "../helpers/api";
import { removeClassesOnDay } from "../helpers/cleanup";
import { findClassOnCalendar } from "../helpers/calendar-navigation";
import { openCalendar } from "../helpers/navigation";
import { setClassTime } from "../helpers/class-time";

async function coachAuth(request: APIRequestContext) {
  const res = await request.post(`${API_ROOT}/auth/login`, { data: { username: COACH_USERNAME, password: COACH_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { Authorization: `Bearer ${(json.accessToken ?? json.access_token) as string}` };
}

test("PAD-508: a cleared time left alone comes back, and the class is created with it", async ({ page, request }) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await page.getByTestId("calendar-toolbar-add-class").click(); // the desktop toolbar (the sheet is the desktop one)
  const sheet = page.getByTestId("add-class-sheet");
  await expect(sheet).toBeVisible();
  const start = page.getByTestId("add-class-start-time");
  const end = page.getByTestId("add-class-end-time");
  await sheet.locator("input").first().fill("PAD-508 class");
  await setClassTime(start, "18:00");
  await setClassTime(end, "19:30");

  // Clear the start time and leave it alone, as in the report.
  await start.fill(""); // empties the old native input and the new field alike
  await expect(start).toHaveValue("");
  await page.waitForTimeout(3000);
  await page.keyboard.press("Tab");
  await expect(start).toHaveValue("18:00");
  await expect(start).not.toHaveAttribute("aria-invalid", "true");

  const created = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/api/app/add_class"));
  await page.getByTestId("add-class-create").click();
  const body = (await created).postDataJSON();
  try {
    expect([body.startTime, body.endTime]).toEqual(["18:00", "19:30"]);
  } finally {
    await removeClassesOnDay(request, await coachAuth(request), body.date, (e) => e.title === "PAD-508 class");
  }
});

test("PAD-508: the list sets the time and the end list shows the class length", async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await page.getByTestId("calendar-toolbar-add-class").click();
  const start = page.getByTestId("add-class-start-time");
  const end = page.getByTestId("add-class-end-time");

  await start.click();
  await page.getByTestId("add-class-start-time-list").getByText("17:15", { exact: true }).click();
  await expect(start).toHaveValue("17:15");
  await expect(page.getByTestId("add-class-start-time-list")).toHaveCount(0);

  await end.click();
  const endList = page.getByTestId("add-class-end-time-list");
  await expect(endList.locator("button").first()).toContainText("17:30");
  await endList.locator("button", { hasText: /^18:45/ }).click();
  await expect(end).toHaveValue("18:45");
});

test("PAD-508: editing a class sets its time from the list and by typing; the end follows the start", async ({ page, request }) => {
  test.setTimeout(120_000);
  const auth = await coachAuth(request);
  const day = new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const NAME = "PAD-508 edit class";
  const res = await request.post(`${API_ROOT}/app/add_class`, {
    headers: auth,
    data: { name: NAME, classType: "academy", maxPlayers: 4, date: day, startTime: "10:00", endTime: "11:00", isRecurring: false },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  try {
    await loginAsCoach(page);
    await openCalendar(page);
    expect(await findClassOnCalendar(page, NAME)).toBe(true);
    await page.getByText(NAME).first().click();
    const sheet = page.getByRole("dialog");
    const save = sheet.getByTestId("class-edit-save");
    for (let attempt = 0; attempt < 3; attempt++) {
      await sheet.getByTestId("class-edit").click({ timeout: 10_000 });
      if (await save.isVisible({ timeout: 5_000 }).catch(() => false)) break;
    }
    await expect(save).toBeVisible();

    const start = sheet.getByTestId("class-detail-start-time");
    const end = sheet.getByTestId("class-detail-end-time");
    await start.click();
    await page.getByTestId("class-detail-start-time-list").getByText("11:00", { exact: true }).click();
    await expect(start).toHaveValue("11:00");
    await expect(end).toHaveValue("12:00"); // the end reached by the start keeps the hour (rule 7b)
    // An end typed before the start is never sent (rule 7b).
    let early = 0;
    const countEdits = (r: { method(): string; url(): string }) => {
      if (r.method() === "POST" && /\/api\/app\/edit_class$/.test(r.url())) early += 1;
    };
    page.on("request", countEdits);
    await end.fill("1030");
    await end.press("Tab"); // leaving the field commits it
    await expect(end).toHaveValue("10:30");
    await save.click();
    await page.waitForTimeout(1000); // a request, if one were sent, would have left by now
    expect(early).toBe(0);
    page.off("request", countEdits);

    await end.fill("1215");
    await end.press("Tab");
    await expect(end).toHaveValue("12:15");

    const saved = page.waitForRequest((r) => r.method() === "POST" && /\/api\/app\/edit_class$/.test(r.url()));
    await save.click();
    const updates = (await saved).postDataJSON().updates;
    expect([updates.startTime, updates.endTime]).toEqual(["11:00", "12:15"]);
  } finally {
    await removeClassesOnDay(request, auth, day, (e) => e.title === NAME);
  }
});
