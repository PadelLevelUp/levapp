/**
 * PAD-680 — notifications.notification-sound: a message from someone else chimes in an open tab
 * once the person has interacted with the page (rules 2–3), and the "Notification sound" switch is
 * saved with the Preferences Save and silences it (rule 1).
 *
 * The chime is Web Audio, so the spec counts the oscillators the page starts (an init script wraps
 * AudioContext); a chime is two notes. The switch is restored to ON at the end for later specs.
 *
 * Run:
 *   npx playwright test e2e/settings/notification-sound.spec.ts
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsCoach, COACH_USERNAME, COACH_PASSWORD, STUDENT_USERNAME, STUDENT_PASSWORD } from "../helpers/auth";
import { openSettings } from "../helpers/navigation";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui } from "../helpers/i18n";

/** The seeded coach's display name (e2e/scripts/seed.py). */
const COACH_NAME = "E2E Coach";

async function apiToken(request: APIRequestContext, username: string, password: string): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

/** The student writes to the coach: a message from someone else, over SSE to the coach's tab. */
async function studentWritesToCoach(request: APIRequestContext): Promise<void> {
  const headers = { Authorization: `Bearer ${await apiToken(request, STUDENT_USERNAME, STUDENT_PASSWORD)}` };
  const { conversations } = await (await request.get(`${API_APP}/conversations`, { headers })).json();
  const withCoach = conversations.find((c: { participantName?: string | null }) => c.participantName === COACH_NAME);
  expect(withCoach, `student must have a conversation named "${COACH_NAME}"`).toBeTruthy();
  const sent = await request.post(`${API_APP}/message`, {
    headers,
    data: { conversationId: String(withCoach.id), text: `PAD-680 sound probe ${Date.now()}` },
  });
  expect(sent.status()).toBeLessThan(300);
}

/** Counts the oscillators the page starts: two per chime. */
async function countNotes(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext; __notes: number };
    w.__notes = 0;
    const Real = w.AudioContext;
    w.AudioContext = class extends Real {
      createOscillator() {
        w.__notes += 1;
        return super.createOscillator();
      }
    } as typeof AudioContext;
  });
}

const notes = (page: Page) => page.evaluate(() => (window as unknown as { __notes: number }).__notes);

async function setSound(page: Page, on: boolean) {
  await openSettings(page);
  await page.getByRole("button", { name: ui("settings.nav.preferences") }).first().click();
  const toggle = page.getByTestId("settings-notification-sound");
  await expect(toggle).toBeEnabled({ timeout: 5000 });
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) {
    await toggle.click();
    const saved = page.waitForResponse(
      (r) => /\/api\/auth\/me$/.test(r.url()) && r.request().method() === "PATCH" && r.status() === 200,
      { timeout: 10_000 },
    );
    await page.getByTestId("settings-header-save").click();
    await saved;
  }
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}

test("PAD-680: a message from someone else chimes; the switch off silences it and persists", async ({ page, request }) => {
  await countNotes(page);
  await loginAsCoach(page);
  await setSound(page, true);
  // SSE is not replayed: send only once this page's stream is open.
  const stream = page.waitForResponse((r) => /\/app\/events\?/.test(r.url()), { timeout: 15_000 });
  await page.goto("/calendar");
  await stream;
  // Rule 3 (autoplay): the page may make sound only after an interaction.
  await page.mouse.click(5, 5);

  await studentWritesToCoach(request);
  // At least one chime (two notes); a system message arriving meanwhile may add one.
  await expect.poll(() => notes(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  await setSound(page, false);
  const counted = await notes(page);
  // The unread count refreshes on the same SSE event, so its answer proves the message arrived.
  const arrived = page.waitForResponse((r) => /\/messages\/unread_count/.test(r.url()), { timeout: 10_000 });
  await studentWritesToCoach(request);
  await arrived;
  expect(await notes(page)).toBe(counted);

  // The server agrees, then restore for later specs.
  const token = await apiToken(request, COACH_USERNAME, COACH_PASSWORD);
  const me = await request.get(`${API_AUTH}/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect((await me.json()).notificationSound).toBe(false);
  await setSound(page, true);
});
