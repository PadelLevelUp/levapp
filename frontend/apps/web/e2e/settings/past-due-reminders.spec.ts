/**
 * PAD-478 (notifications.config rule 10f): a saved timing can put a class's reminder time in the
 * past. The save sends nothing; the web form asks the coach right after the tab's Save (PAD-506:
 * a timing change is held until `settings-header-save`, so nothing is saved, and nothing asked, before it).
 *
 * WHICH classes are past due is the server's decision and is pinned by the backend tests
 * (test_pad478_ask_before_sending.py). Here the save's real answer is given a `pastDue` list on
 * its way back, and the send request is captured, so the spec pins what the browser does with
 * them: when it asks, what each button does, and that an answered class is not asked about again.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

const ACADEMY = { key: "i:1", title: "Academy B1", startsAt: "2027-07-12T18:00:00", students: 3 };
const KIDS = { key: "o:7:2027-07-13", title: "Kids", startsAt: "2027-07-13T10:00:00", students: 2 };

async function openReminders(page: Page) {
  await loginAsCoach(page);
  await openSettings(page);
  await page.getByTestId("settings-nav-notifications").click();
  const toggle = page.getByTestId("notification-engine-auto-notify-toggle");
  await expect(toggle).toBeVisible();
  const section = page.getByTestId("notification-engine-section-reminders");
  if ((await toggle.getAttribute("data-state")) === "unchecked") {
    await toggle.click();
    await expect(section).toBeEnabled();
  }
  await section.click();
  await expect(page.getByTestId("reminder-per-student")).toBeVisible();
}

test("PAD-478: a past-due class is asked about once the coach stops; only a yes sends, and only what was listed", async ({ page }) => {
  let listed = [ACADEMY];
  let timingSaves = 0;
  const sends: unknown[] = [];
  await page.route("**/api/app/notify/config", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    if ("reminderTiming" in (route.request().postDataJSON() ?? {})) {
      timingSaves += 1;
      body.pastDue = { reminders: listed, quietUntil: null };
    }
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/app/notify/past_due/send", async (route) => {
    sends.push(route.request().postDataJSON());
    await route.fulfill({ json: { sent: 2, scheduledFor: null, classes: [], skipped: 0 } });
  });

  await openReminders(page);
  const stepper = page.getByTestId("reminder-per-student").getByRole("button");
  const dialog = page.getByTestId("past-due-dialog");
  const body = page.getByTestId("past-due-body");

  const save = page.getByTestId("settings-header-save");

  // 1. A tap is only held: nothing is saved and nothing is asked. The Save lists a class: the coach
  // is asked, and nothing has been sent.
  await stepper.nth(1).click();
  await expect(save).toBeEnabled();
  expect(timingSaves).toBe(0);
  await expect(dialog).toBeHidden();
  await save.click();
  await expect.poll(() => timingSaves).toBe(1);
  await expect(dialog).toBeVisible();
  await expect(body).toContainText("Academy B1");
  await expect(body).toContainText("18:00");
  expect(sends).toEqual([]);

  // 2. "Do not send" sends nothing.
  await page.getByTestId("past-due-decline").click();
  await expect(dialog).toBeHidden();
  expect(sends).toEqual([]);

  // 3. A later save lists the same class: not asked again in this visit.
  await stepper.nth(1).click();
  await save.click();
  await expect.poll(() => timingSaves).toBe(2);
  await expect(save).toBeDisabled();
  await expect(dialog).toBeHidden();

  // 4. A later save lists a new class too: asked about that one alone; yes sends exactly its key.
  listed = [ACADEMY, KIDS];
  await stepper.nth(0).click();
  await save.click();
  await expect.poll(() => timingSaves).toBe(3);
  await expect(dialog).toBeVisible();
  await expect(body).toContainText("Kids");
  await expect(body).not.toContainText("Academy B1");
  await page.getByTestId("past-due-send").click();
  await expect(dialog).toBeHidden();
  expect(sends).toEqual([{ reminders: [KIDS.key] }]);

  // Back to the seeded count; both classes are answered for, so this save asks nothing.
  await stepper.nth(0).click();
  await save.click();
  await expect.poll(() => timingSaves).toBe(4);
  await expect(dialog).toBeHidden();
  expect(sends).toHaveLength(1);
});
