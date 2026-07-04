import { test, expect } from "@playwright/test";
import { loginAsStudent } from "../helpers/auth";
import { openMessages } from "../helpers/navigation";

// PAD-31: The chat header subtitle must reflect the other participant's actual
// role (e.g. "Coach") instead of a hardcoded "Player" label.
//
// Uses the seeded conversation between e2e-coach and e2e-student. Logging in as
// the student and opening the conversation with the coach, the header above the
// message input must read "Coach" — not "Player".

test.beforeEach(async ({ page }) => {
  await loginAsStudent(page);
  await openMessages(page);
});

test("PAD-31: coach participant shows 'Coach' role in chat header, not 'Player'", async ({ page }) => {
  // Open the seeded conversation with the coach.
  await page.getByText("E2E Coach").first().click();
  await page.waitForResponse(
    (r) => /\/api\/app\/conversation\/\d+/.test(r.url()) && r.status() === 200,
    { timeout: 10_000 }
  );

  // Locate the chat header (contains the participant name heading).
  const header = page
    .locator("div", { has: page.getByRole("heading", { name: "E2E Coach" }) })
    .last();
  await expect(header.getByRole("heading", { name: "E2E Coach" })).toBeVisible({
    timeout: 5000,
  });

  // The subtitle must say "Coach" and must NOT say "Player".
  await expect(header.getByText("Coach", { exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(header.getByText("Player", { exact: true })).toHaveCount(0);
});
