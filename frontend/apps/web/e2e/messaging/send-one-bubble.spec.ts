import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openMessages, conversationRow } from "../helpers/navigation";

/**
 * PAD-647 — one bubble per send, whichever answers first: the POST that saves the message or the
 * live `message_created` echo. The echo can win (the server publishes before it answers), and the
 * web thread then replaced its temp bubble with the saved message although the echo had already
 * appended it: the same id twice until a reload.
 *
 * The race is forced, not hoped for: the POST's answer is held until the echo has drawn its bubble
 * (temp + echo = two on screen), then released. Afterwards exactly one bubble may remain.
 */
test("PAD-647: a message the live echo delivers before the POST answers shows once", async ({ page }) => {
  await loginAsCoach(page);
  await openMessages(page);
  await Promise.all([
    page.waitForResponse((r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200, {
      timeout: 10_000,
    }),
    conversationRow(page, "E2E Student").click(),
  ]);

  const text = `PAD-647 one bubble ${Date.now()}`;
  const inThread = page.getByTestId("message-scroller").getByText(text, { exact: true });

  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/app/message", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const response = await route.fetch(); // the server saves and publishes the echo now
    await released; // …but the page only hears the answer once the echo has been drawn
    await route.fulfill({ response });
  });

  const input = page.getByPlaceholder(/type a message/i);
  await input.fill(text);
  await input.press("Enter");

  // The temp bubble and the echoed one are both on screen: the echo won the race.
  await expect(inThread).toHaveCount(2, { timeout: 10_000 });
  release();

  // The POST's answer must not add a second copy of the saved message.
  await expect(inThread).toHaveCount(1, { timeout: 5_000 });
});
