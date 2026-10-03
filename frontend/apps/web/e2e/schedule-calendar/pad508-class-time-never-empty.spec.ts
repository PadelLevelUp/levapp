/**
 * B-275 (PAD-508): the class sheet never sends an empty time.
 *
 * The native time input reads "" once a segment is cleared (Backspace on the hour), whatever the coach
 * does next. The sheet used to send that "" — the server raised and answered 500, a failure that named
 * nothing. Now the sheet flags the time and sends nothing; the server refuses the same values with a 400.
 * Real key presses, as a coach would. Located by test id.
 */
import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openCalendar } from "../helpers/navigation";

test("B-275: a cleared hour on the new-class sheet is flagged and nothing is sent", async ({ page }) => {
  await loginAsCoach(page);
  await openCalendar(page);
  await page.getByTestId("calendar-toolbar-add-class").click(); // the desktop toolbar (the sheet is the desktop one)
  const sheet = page.getByTestId("add-class-sheet");
  await expect(sheet).toBeVisible();
  const start = page.getByTestId("add-class-start-time");

  await sheet.locator("input").first().fill("B-275 class");
  await start.click({ position: { x: 12, y: 10 } }); // the hour segment
  await page.keyboard.press("Backspace");
  await expect(start).toHaveValue("");

  let sent = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/app/add_class")) sent += 1;
  });
  await page.getByTestId("add-class-create").click();

  await expect(start).toHaveAttribute("aria-invalid", "true");
  await page.waitForTimeout(1000); // a request, if one were sent, would have left by now
  expect(sent).toBe(0);

  // Typing the hour back makes the class creatable again.
  await start.click({ position: { x: 12, y: 10 } });
  await page.keyboard.type("10");
  await expect(start).toHaveValue("10:00");
});
