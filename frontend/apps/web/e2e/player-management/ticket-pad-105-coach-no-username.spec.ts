import { test, expect, type Page } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openPlayers } from "../helpers/navigation";

/**
 * PAD-105 — the coach never chooses a player's username.
 *
 * Picking a username is picking a credential, so it belongs to the student.
 * The coach-facing surfaces (add-player sheet, player detail, edit sheet) must
 * expose no username field at all; the backend assigns a placeholder at
 * creation which the student replaces when they activate their own account
 * (invite link — `players.invite-completion` — or the activation link).
 *
 * Spec: specs/players/spec.md → `players.create` rules 4–6.
 */

const UNIQUE = Date.now();

async function openAddPlayerSheet(page: Page) {
  await page.getByRole("button", { name: /add player/i }).first().click();
  await expect(page.getByText("New player")).toBeVisible({ timeout: 5000 });
}

test.describe("PAD-105: coach add-player form has no username field", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page);
    await openPlayers(page);
  });

  test("PAD-105: the add-player sheet shows no username input and creates with a name alone", async ({
    page,
  }) => {
    await openAddPlayerSheet(page);

    // No username control of any kind in the coach's create form.
    await expect(page.locator("#player-username")).toHaveCount(0);
    await expect(page.getByPlaceholder("e.g. johndoe")).toHaveCount(0);
    await expect(
      page.getByLabel(/^(username|nome de utilizador)$/i)
    ).toHaveCount(0);

    // The other fields the coach IS responsible for are still there.
    await expect(page.getByPlaceholder("e.g. John Doe")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. john@email.com")).toBeVisible();

    const name = `PAD105 Nameless ${UNIQUE}`;
    await page.getByPlaceholder("e.g. John Doe").fill(name);

    // A name is all it takes — no waiting on a username availability check.
    const createBtn = page.getByRole("button", { name: /create player/i });
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    await createBtn.click();

    // The player is created despite no username being supplied.
    await page.getByPlaceholder(/search/i).first().fill(name);
    await expect(page.getByText(name)).toBeVisible({ timeout: 8000 });
  });

  test("PAD-105: the coach's player detail view exposes no username field", async ({
    page,
  }) => {
    const name = `PAD105 Detail ${UNIQUE}`;

    await openAddPlayerSheet(page);
    await page.getByPlaceholder("e.g. John Doe").fill(name);
    await page.getByRole("button", { name: /create player/i }).click();

    await page.getByPlaceholder(/search/i).first().fill(name);
    await page.getByText(name).click();
    await page.waitForURL(/\/players\/\d+/, { timeout: 8000 });

    // The generated placeholder username is an internal detail: it must never
    // be rendered to the coach.
    await expect(page.getByText(/pending-[0-9a-f]{4}/i)).toHaveCount(0);

    // The player header "Edit" puts the detail page into inline edit mode.
    // There must still be nothing username-shaped to type into.
    await page.getByRole("button", { name: /^edit$/i }).first().click();

    // Edit mode is live: the info card's other fields became inputs.
    await expect(page.getByPlaceholder(/^email$/i)).toBeVisible({
      timeout: 5000,
    });

    await expect(
      page.getByPlaceholder(/username|nome de utilizador/i)
    ).toHaveCount(0);
    await expect(page.getByText(/^username$/i)).toHaveCount(0);
    await expect(page.getByText(/pending-[0-9a-f]{4}/i)).toHaveCount(0);
  });

  test("PAD-105: the student's registration form lets them pick a username, unprefilled", async ({
    page,
    browser,
  }) => {
    // The coach-created player's only route to an account is the registration
    // link on their detail page. That form is where the username is chosen, so
    // it must offer an EMPTY box — prefilling the generated `pending-…`
    // placeholder would leak an internal detail and nudge the student into
    // keeping a machine-generated login.
    const name = `PAD105 Register ${UNIQUE}`;

    await openAddPlayerSheet(page);
    await page.getByPlaceholder("e.g. John Doe").fill(name);
    await page.getByRole("button", { name: /create player/i }).click();

    await page.getByPlaceholder(/search/i).first().fill(name);
    await page.getByText(name).click();
    await page.waitForURL(/\/players\/\d+/, { timeout: 8000 });

    // The detail page surfaces the shareable registration link in a readonly box.
    const registerLink = await page
      .locator("input[readonly]")
      .first()
      .inputValue();
    expect(registerLink).toContain("/register/");
    const userId = registerLink.split("/register/")[1];

    const context = await browser.newContext();
    const registerPage = await context.newPage();
    await registerPage.goto(`/register/${userId}`);

    const usernameInput = registerPage.locator("#username");
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
    await expect(usernameInput).toHaveValue("");

    // The name the coach set IS prefilled — that part is the coach's to fill in.
    await expect(registerPage.locator("#name")).toHaveValue(name);

    // The student picks their own username and activates. The activation form
    // requires an email of its own (pre-existing rule) — the coach left it blank.
    const chosen = `pad105-chosen-${UNIQUE}`;
    await usernameInput.fill(chosen);
    await registerPage.locator("#email").fill(`${chosen}@example.com`);
    await registerPage.locator("#password").fill("Pad105Chosen!");
    await registerPage.locator("#repeatPassword").fill("Pad105Chosen!");
    await registerPage.locator('button[type="submit"]').click();

    // Activation lands them on the login page; the username they chose works.
    await registerPage.waitForURL(/\/auth/, { timeout: 15_000 });
    await registerPage.locator("#username").fill(chosen);
    await registerPage.locator("#password").fill("Pad105Chosen!");
    await registerPage.locator('button[type="submit"]').click();
    await registerPage.waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: 15_000,
    });

    await context.close();
  });

  test("PAD-105: the username field still exists in the student's own invite flow", async ({
    page,
    browser,
  }) => {
    // The other half of the ticket: removing the coach's field must not remove
    // the student's. Create an invited player and open their link as a guest.
    await openAddPlayerSheet(page);
    await page.getByPlaceholder("e.g. John Doe").fill(`PAD105 Invitee ${UNIQUE}`);
    await page
      .getByRole("button", { name: /create.*invite|invite.*player/i })
      .click();

    const dialog = page.getByRole("dialog", { name: /invite/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const link = await dialog.getByRole("textbox").inputValue();
    const token = link.split("/invite/player/")[1];
    expect(token).toBeTruthy();

    const context = await browser.newContext();
    const invitePage = await context.newPage();
    await invitePage.goto(`/invite/player/${token}`);

    // The student picks their own username here.
    await expect(invitePage.locator("#username")).toBeVisible({
      timeout: 10_000,
    });

    await context.close();
  });
});
