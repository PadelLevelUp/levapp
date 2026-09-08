import { API_AUTH } from "../helpers/api";
import { test, expect, Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { completeEmailVerification } from "../helpers/emailVerification";
import { openSettings } from "../helpers/navigation";

/**
 * PAD-81 — "Profile changes not saved despite success notification".
 *
 * The Settings → Profile panel used to be pure local state seeded with hardcoded
 * values ("Coach Name" / "coach@email.com"): Save fired a success toast without
 * ever calling the backend, so every edit was silently lost. `PATCH /api/auth/me`
 * only accepted `language`.
 *
 * Spec: settings.profile — the panel is hydrated from `GET /api/auth/me`, Save
 * persists name/abbreviation/email/phone through `PATCH /api/auth/me`, and the
 * success notification only appears after the API confirms the write.
 *
 * The seeded coach is shared by the whole suite, so this spec restores the
 * original profile values in `afterEach`.
 */

const ORIGINAL = {
  name: "E2E Coach",
  abbreviation: "",
  email: "e2e-coach@test.com",
  phone: "",
};

async function openProfile(page: Page) {
  await openSettings(page);
  // SettingsPage nav uses plain <button> elements, not role="tab".
  await page.getByRole("button", { name: /^profile$/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /^profile$/i })
  ).toBeVisible({ timeout: 5000 });
  // The form is hydrated from GET /auth/me — wait for that to land before
  // reading or typing, otherwise we'd race the in-flight request.
  await expect(nameField(page)).not.toHaveValue("", { timeout: 5000 });
}

function nameField(page: Page) {
  return page.getByLabel(/^name$/i);
}
function abbreviationField(page: Page) {
  return page.getByLabel(/abbreviation/i);
}
function emailField(page: Page) {
  return page.getByLabel(/^email$/i);
}
function phoneField(page: Page) {
  return page.getByLabel(/phone/i);
}

async function save(page: Page) {
  await page.getByRole("button", { name: /save changes/i }).click();
}

test.beforeEach(async ({ page }) => {
  await loginAsCoach(page);
});

test.afterEach(async ({ page }) => {
  // Restore the shared seeded coach straight through the API so a mid-test
  // failure can't leak edited values into later specs.
  const token = await page
    .evaluate(() => localStorage.getItem("accessToken"))
    .catch(() => null);
  if (!token) return;
  await page
    .request.patch(`${API_AUTH}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      data: ORIGINAL,
    })
    .catch(() => undefined);

  // PAD-234: restoring the address is itself an email change, so it re-arms
  // verification and would leave the shared seeded coach stuck on the code
  // screen for every later spec. Clear it through the same debug outbox the
  // UI helper uses, so the coach is handed back verified.
  const auth = { Authorization: `Bearer ${token}` };
  const codeRes = await page.request
    .get(`${API_AUTH}/email-verification/debug/last-code`, { headers: auth })
    .catch(() => null);
  if (!codeRes?.ok()) return;
  const { code } = (await codeRes.json()) as { code: string };
  await page.request
    .post(`${API_AUTH}/email-verification/confirm`, { headers: auth, data: { code } })
    .catch(() => undefined);
});

// The form must be hydrated from the server, not from hardcoded defaults.
test("PAD-81: profile fields are loaded from the signed-in user", async ({
  page,
}) => {
  await openProfile(page);

  await expect(nameField(page)).toHaveValue(ORIGINAL.name);
  await expect(emailField(page)).toHaveValue(ORIGINAL.email);
});

// The core bug: success toast without persistence.
test("PAD-81: saved profile changes persist after a reload", async ({
  page,
}) => {
  await openProfile(page);

  await nameField(page).fill("PAD81 Coach");
  await abbreviationField(page).fill("P81");
  await emailField(page).fill("pad81-coach@test.com");
  await phoneField(page).fill("+351912345678");

  const patch = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/me") && res.request().method() === "PATCH"
  );
  await save(page);
  expect((await patch).status()).toBe(200);

  await expect(page.getByText(/settings saved/i).first()).toBeVisible({
    timeout: 5000,
  });

  // PAD-234: changing the address re-verifies it (auth.email-verification
  // rule 3 / settings.profile rule 9), so the app sends the coach to the code
  // screen. Clear it here, both so the reload below lands on the profile and
  // so the shared seeded coach is left verified for the tests that follow.
  await completeEmailVerification(page);

  // The whole point of the ticket: the values survive a reload.
  await page.reload();
  await openProfile(page);

  await expect(nameField(page)).toHaveValue("PAD81 Coach");
  await expect(abbreviationField(page)).toHaveValue("P81");
  await expect(emailField(page)).toHaveValue("pad81-coach@test.com");
  await expect(phoneField(page)).toHaveValue("+351912345678");
});

// A failed write must never be reported as a success.
test("PAD-81: a failed save reports an error, not success", async ({ page }) => {
  await openProfile(page);
  await nameField(page).fill("Should Not Persist");

  await page.route("**/api/auth/me", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "boom" }),
      });
      return;
    }
    await route.continue();
  });

  await save(page);

  await expect(
    page.getByText(/could not save settings/i).first()
  ).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/settings saved/i)).toHaveCount(0);

  await page.unroute("**/api/auth/me");

  // And nothing was written server-side.
  await page.reload();
  await openProfile(page);
  await expect(nameField(page)).toHaveValue(ORIGINAL.name);
});
