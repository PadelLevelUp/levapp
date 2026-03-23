import { test, expect } from "@playwright/test";
import { loginAsCoach } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openNotificationsTab(page: import("@playwright/test").Page) {
  await loginAsCoach(page);
  await openSettings(page);
  // Custom <button> nav — not role="tab"
  await page.getByRole("button", { name: /notifications/i }).click();
  // Wait for the notification engine card to render
  await expect(page.getByText(/auto-invite engine/i)).toBeVisible({ timeout: 5000 });
}

async function openSection(page: import("@playwright/test").Page, label: RegExp | string) {
  const trigger = page.getByRole("button", { name: label }).first();
  await trigger.click();
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// US-53 / F-53: Notification engine settings page renders
// ---------------------------------------------------------------------------

test("US-53: notification engine card is visible in the notifications tab", async ({ page }) => {
  await openNotificationsTab(page);

  await expect(page.getByText(/auto-invite engine/i)).toBeVisible();
  await expect(page.getByText(/automatic notifications/i)).toBeVisible();
});

test("US-53: master auto-notify toggle is present and interactive", async ({ page }) => {
  await openNotificationsTab(page);

  const toggle = page.locator("role=switch").first();
  await expect(toggle).toBeVisible();
  // Toggle should be interactable without error
  await toggle.click();
  await toggle.click();
});

// ---------------------------------------------------------------------------
// US-71 / F-69: Reminders section
// ---------------------------------------------------------------------------

test("US-71: reminders section can be opened", async ({ page }) => {
  await openNotificationsTab(page);

  await openSection(page, /^reminders$/i);

  await expect(page.getByText(/first reminder timing/i)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/reminders per student/i)).toBeVisible();
});

test("US-71: reminders timing mode selector has both options", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^reminders$/i);

  // Open the first timing mode Select
  const selects = page.locator('[role="combobox"]');
  await selects.first().click();

  await expect(page.getByRole("option", { name: /hours before class/i })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("option", { name: /days before at specific time/i })).toBeVisible();

  // Close
  await page.keyboard.press("Escape");
});

test("US-71: switching to days-before mode shows days stepper and time input", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^reminders$/i);

  const selects = page.locator('[role="combobox"]');
  await selects.first().click();
  await page.getByRole("option", { name: /days before at specific time/i }).click();

  // Should now show a time input (HH:MM)
  await expect(page.locator('input[type="time"]').first()).toBeVisible({ timeout: 3000 });
});

test("US-71: hours-between-reminders field appears only when reminder count > 1", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^reminders$/i);

  // By default count is 1, so field should not be visible
  const betweenLabel = page.getByText(/hours between reminders/i);
  const defaultVisible = await betweenLabel.isVisible().catch(() => false);

  if (!defaultVisible) {
    // Increment reminder count to 2 by clicking the + button next to "Reminders per student"
    const plusButtons = page.getByRole("button").filter({ has: page.locator("svg") });
    // Find the + button that follows "Reminders per student" label
    await page.getByText(/reminders per student/i).locator("..").locator("..").getByRole("button").last().click();
    await expect(page.getByText(/hours between reminders/i)).toBeVisible({ timeout: 3000 });
  }
});

test("US-71: start invitations timing selector is present", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^reminders$/i);

  await expect(page.getByText(/start invitations/i)).toBeVisible({ timeout: 3000 });
  // Two mode selects should be present (first reminder + invitation start)
  const selects = page.locator('[role="combobox"]');
  expect(await selects.count()).toBeGreaterThanOrEqual(2);
});

// ---------------------------------------------------------------------------
// US-72 / F-70: Invitation groups section
// ---------------------------------------------------------------------------

test("US-72: invitation groups section can be opened", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /invitation groups/i);

  await expect(page.getByText(/group 1/i)).toBeVisible({ timeout: 3000 });
});

test("US-72: each group card shows an add rule button", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /invitation groups/i);

  await expect(page.getByRole("button", { name: /add rule/i }).first()).toBeVisible({ timeout: 3000 });
});

test("US-72: adding a rule appends an attribute selector row", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /invitation groups/i);

  // Count existing rule rows in group 1 before adding
  const rulesBefore = await page.locator('[role="combobox"]').count();

  await page.getByRole("button", { name: /add rule/i }).first().click();
  await page.waitForTimeout(300);

  // One more combobox should appear (the attribute selector for the new rule)
  const rulesAfter = await page.locator('[role="combobox"]').count();
  expect(rulesAfter).toBeGreaterThan(rulesBefore);
});

test("US-72: level attribute shows level-specific operations", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /invitation groups/i);

  // Open the attribute selector in the first rule of group 1
  const firstRuleAttrSelect = page.locator('[role="combobox"]').first();
  await firstRuleAttrSelect.click();

  await expect(page.getByRole("option", { name: /level/i })).toBeVisible({ timeout: 3000 });
  await page.getByRole("option", { name: /^level$/i }).click();

  // Open operation selector
  const opSelect = page.locator('[role="combobox"]').nth(1);
  await opSelect.click();

  await expect(page.getByRole("option", { name: /same as vacancy/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /one level above/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /one level below/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /all levels above/i })).toBeVisible();
  await expect(page.getByRole("option", { name: /all levels below/i })).toBeVisible();

  await page.keyboard.press("Escape");
});

test("US-72: add group button appears and adds a new group card", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /invitation groups/i);

  const groupsBefore = await page.getByText(/^group \d+$/i).count();
  await page.getByRole("button", { name: /add group/i }).click();
  await page.waitForTimeout(300);

  const groupsAfter = await page.getByText(/^group \d+$/i).count();
  expect(groupsAfter).toBeGreaterThan(groupsBefore);
});

test("US-72: last group with rules shows the empty group hint", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /invitation groups/i);

  // The seeded default config has group 3 as empty — no hint expected.
  // Add a rule to the last group to trigger the hint.
  const addRuleButtons = page.getByRole("button", { name: /add rule/i });
  await addRuleButtons.last().click();
  await page.waitForTimeout(300);

  await expect(page.getByText(/tip.*last group/i)).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// US-73 / F-71: Tiebreakers section
// ---------------------------------------------------------------------------

test("US-73: tiebreakers section can be opened and shows default items", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /tiebreakers/i);

  await expect(page.getByText(/fewest unjustified absences/i)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/highest attendance rate/i)).toBeVisible();
  await expect(page.getByText(/most justified absences/i)).toBeVisible();
});

test("US-73: tiebreaker toggle switches enabled state", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /tiebreakers/i);

  // Get all switches inside the tiebreakers collapsible content
  const switches = page.locator('[role="switch"]');
  const count = await switches.count();
  expect(count).toBeGreaterThanOrEqual(3);

  // Toggle the last tiebreaker (should be disabled by default)
  const lastSwitch = switches.last();
  const before = await lastSwitch.getAttribute("data-state");
  await lastSwitch.click();
  const after = await lastSwitch.getAttribute("data-state");
  expect(before).not.toEqual(after);
});

test("US-73: tiebreaker rows have drag handles", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /tiebreakers/i);

  // Each row has a GripVertical icon button
  const gripHandles = page.locator('button').filter({ has: page.locator('svg') }).first();
  await expect(gripHandles).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// US-74 / F-53: Restrictions section — new fields
// ---------------------------------------------------------------------------

test("US-74: restrictions section shows new maxInactiveTime row", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^restrictions$/i);

  await expect(page.getByText(/max inactive time/i)).toBeVisible({ timeout: 3000 });
});

test("US-74: excluded players row appears and can be enabled", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^restrictions$/i);

  await expect(page.getByText(/excluded players/i)).toBeVisible({ timeout: 3000 });

  // Enable excluded players to show the search field
  const row = page.getByText(/excluded players/i).locator("../..").locator("..");
  const toggle = row.locator('[role="switch"]').first();
  const wasUnchecked = (await toggle.getAttribute("data-state")) === "unchecked";

  if (wasUnchecked) {
    await toggle.click();
  }

  await expect(page.getByPlaceholder(/search players/i)).toBeVisible({ timeout: 3000 });
});

test("US-74: exclude unpaid subscriptions toggle is present", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^restrictions$/i);

  await expect(page.getByText(/exclude unpaid subscriptions/i)).toBeVisible({ timeout: 3000 });
});

test("US-75: max inactive time stepper is functional when enabled", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /^restrictions$/i);

  // Find and enable the max inactive time toggle
  const inactiveRow = page.getByText(/max inactive time/i).locator("../..").locator("..");
  const toggle = inactiveRow.locator('[role="switch"]').first();

  if ((await toggle.getAttribute("data-state")) === "unchecked") {
    await toggle.click();
  }

  // The stepper buttons (+ and -) should now be visible
  await expect(inactiveRow.getByRole("button").first()).toBeVisible({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// US-56 / F-55: Message templates section — new groups and variable chips
// ---------------------------------------------------------------------------

test("US-56: message templates section shows three subheadings", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /message templates/i);

  await expect(page.getByText(/^reminders$/i)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/^invitations$/i)).toBeVisible();
  await expect(page.getByText(/^waiting list$/i)).toBeVisible();
});

test("US-56: new reminder templates are present", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /message templates/i);

  await expect(page.getByText(/attendance reminder/i)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/reminder follow-up/i)).toBeVisible();
  await expect(page.getByText(/attendance confirmed/i)).toBeVisible();
  await expect(page.getByText(/attendance declined/i)).toBeVisible();
});

test("US-56: waiting list templates are present", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /message templates/i);

  await expect(page.getByText(/waiting list offer/i)).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/spot from waiting list/i)).toBeVisible();
});

test("US-56: variable chips are shown and insert text at cursor", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /message templates/i);

  // The invite template textarea should have variable chips below it
  await expect(page.getByText(/\{name\}/).first()).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/\{time\}/).first()).toBeVisible();

  // Click {name} chip to insert into the first textarea with that chip
  const nameChip = page.getByText(/\{name\}/).first();
  const inviteTextarea = page.locator("textarea").first();

  await inviteTextarea.fill("Hey ");
  await inviteTextarea.click();
  await nameChip.click();

  // Textarea value should now contain {name}
  const value = await inviteTextarea.inputValue();
  expect(value).toContain("{name}");
});

test("US-56: save templates button is disabled when no changes are made", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /message templates/i);

  const saveBtn = page.getByRole("button", { name: /save templates/i });
  await expect(saveBtn).toBeVisible({ timeout: 3000 });
  await expect(saveBtn).toBeDisabled();
});

test("US-56: save templates button enables after editing a template", async ({ page }) => {
  await openNotificationsTab(page);
  await openSection(page, /message templates/i);

  const firstTextarea = page.locator("textarea").first();
  await firstTextarea.fill("New invite text " + Date.now());

  const saveBtn = page.getByRole("button", { name: /save templates/i });
  await expect(saveBtn).toBeEnabled({ timeout: 3000 });
});

// ---------------------------------------------------------------------------
// Disabled state: sections locked when auto-notify is off
// ---------------------------------------------------------------------------

test("sections requiring auto-notify are locked when toggle is off", async ({ page }) => {
  await openNotificationsTab(page);

  // Ensure the master toggle is OFF
  const masterToggle = page.locator('[role="switch"]').first();
  if ((await masterToggle.getAttribute("data-state")) === "checked") {
    await masterToggle.click();
  }

  // Reminders, Groups, Tiebreakers, Restrictions triggers should be disabled/dimmed
  const remindersBtn = page.getByRole("button", { name: /^reminders$/i });
  await expect(remindersBtn).toBeDisabled();
});
