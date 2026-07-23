/**
 * E2E test — PAD-67: a blank message template must never send an empty message.
 *
 * Reported flow: a player replies "I'm not coming" to a class reminder. The
 * engine answers with the `reminder_declined` template. When the coach has no
 * template defined for that scenario (never customised, or the textarea was
 * cleared and saved as ""), the delivered confirmation was BLANK — an empty chat
 * bubble plus an empty push notification.
 *
 * Steps:
 *   1. Coach saves `reminder_declined` as whitespace only (the "no template
 *      defined" state the reporter describes) and enables auto-notify at 48h.
 *   2. GET /notify/config must already hand back a resolved, non-blank template
 *      (the settings UI never shows an empty box for an un-customised key).
 *   3. Debug endpoint creates a class 48h+45s out with 2 students; APScheduler
 *      fires the reminder.
 *   4. Student receives the reminder and answers "no".
 *   5. The automatic confirmation that comes back must be the built-in default
 *      for the coach's locale — and above all NOT empty.
 *
 * Run:
 *   POSTGRES_PW=... npx playwright test e2e/notification-engine/blank-template-fallback.spec.ts
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const API_BASE = "http://localhost:5001/api/app";
const AUTH_BASE = "http://localhost:5001/api/auth";

/** Seconds from now until the reminder job fires (>= 30 so APScheduler picks it up). */
const SECONDS_UNTIL_FIRE = 45;

/** Built-in defaults for `reminder_declined`, both locales (backend
 *  DEFAULT_MESSAGE_TEMPLATES / DEFAULT_MESSAGE_TEMPLATES_PT). The seeded e2e
 *  coach is `en`, but accept either so the assertion survives a seed change. */
const DEFAULT_DECLINED_EN = "Got it, thanks for letting us know!";
const DEFAULT_DECLINED_PT = "Entendido, obrigado por avisares!";

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, { data: { username, password } });
  expect(res.ok(), `Login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function setCoachConfig(
  request: APIRequestContext,
  coachToken: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await request.post(`${API_BASE}/notify/config`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: patch,
  });
  expect(
    res.ok(),
    `Failed to update notification config: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
}

type ConvMessage = {
  id: number;
  messageType: string;
  content: string;
  metadata: Record<string, unknown>;
};

/** All messages visible to a user, across every conversation, oldest first. */
async function getAllMessages(
  request: APIRequestContext,
  token: string,
): Promise<ConvMessage[]> {
  const convsRes = await request.get(`${API_BASE}/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!convsRes.ok()) return [];
  const { conversations }: { conversations: Array<{ id: number }> } = await convsRes.json();

  const all: ConvMessage[] = [];
  for (const conv of conversations) {
    const detailRes = await request.get(`${API_BASE}/conversation/${conv.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!detailRes.ok()) continue;
    const detail: { messages: ConvMessage[] } = await detailRes.json();
    all.push(...(detail.messages ?? []));
  }
  return all.sort((a, b) => a.id - b.id);
}

/** Poll until a message matching `predicate` shows up, or the window expires. */
async function pollForMessage(
  request: APIRequestContext,
  token: string,
  predicate: (m: ConvMessage) => boolean,
  maxWaitMs: number,
): Promise<ConvMessage | null> {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const found = (await getAllMessages(request, token)).find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, Math.min(2_000 + attempt * 1_000, 5_000)));
  }
  return null;
}

test.describe("PAD-67 — blank message templates fall back instead of sending empty", () => {
  test(
    "declining a reminder with a blank reminder_declined template sends the default, not an empty message",
    { timeout: 3 * 60 * 1_000 },
    async ({ request }) => {
      const coachToken = await getToken(request, "e2e-coach", "E2eCoach123!");

      // ── Step 1: coach has NO usable reminder_declined template ────────────
      // Whitespace-only is exactly what the Settings textarea saves when a coach
      // clears it — the "no template defined" state from the ticket.
      const CUSTOM_REMINDER =
        "PAD67 reminder for {name}: class {weekday} at {time}. Coming?";
      await setCoachConfig(request, coachToken, {
        autoNotifyEnabled: true,
        reminderTiming: {
          firstReminder: { type: "hours_before", value: 48 },
          reminderCount: 1,
          hoursBetweenReminders: 24,
          invitationStart: { type: "hours_before", value: 24 },
        },
        messageTemplates: { reminder: CUSTOM_REMINDER, reminder_declined: "   " },
      });

      try {
        // ── Step 2: the API must hand back a resolved, non-blank template ────
        const configRes = await request.get(`${API_BASE}/notify/config`, {
          headers: { Authorization: `Bearer ${coachToken}` },
        });
        expect(configRes.ok()).toBeTruthy();
        const savedConfig = await configRes.json();
        const declinedTemplate: string = savedConfig.messageTemplates?.reminder_declined ?? "";
        expect(
          declinedTemplate.trim().length,
          `GET /notify/config returned a blank reminder_declined template: ${JSON.stringify(declinedTemplate)}`,
        ).toBeGreaterThan(0);
        // Every template the settings UI renders must be non-blank.
        for (const [key, value] of Object.entries(savedConfig.messageTemplates ?? {})) {
          expect(String(value).trim().length, `template "${key}" is blank`).toBeGreaterThan(0);
        }

        // ── Step 3: schedule a class whose reminder fires in ~45s ────────────
        const scheduleRes = await request.post(
          `${API_BASE}/notify/debug/schedule_reminder_test`,
          { data: { secondsUntilReminderFires: SECONDS_UNTIL_FIRE } },
        );
        expect(
          scheduleRes.ok(),
          `Debug endpoint returned ${scheduleRes.status()} — is E2E_DEBUG_ENDPOINTS set?`,
        ).toBeTruthy();
        const { instanceId, msToWait } = await scheduleRes.json();
        expect(typeof instanceId).toBe("number");

        await new Promise((r) => setTimeout(r, msToWait));

        // ── Step 4: student receives the reminder, then declines ────────────
        const studentToken = await getToken(request, "e2e-student", "E2eStudent123!");
        const reminder = await pollForMessage(
          request,
          studentToken,
          (m) =>
            m.messageType === "notification_reminder" &&
            Number(m.metadata?.lessonInstanceId) === instanceId,
          30_000,
        );
        expect(
          reminder,
          `e2e-student never received a reminder for instance ${instanceId}`,
        ).not.toBeNull();

        const declineRes = await request.post(`${API_BASE}/notify/respond_reminder`, {
          headers: { Authorization: `Bearer ${studentToken}` },
          data: { lessonInstanceId: instanceId, action: "no" },
        });
        expect(
          declineRes.ok(),
          `respond_reminder failed: ${declineRes.status()} ${await declineRes.text()}`,
        ).toBeTruthy();

        // ── Step 5: the confirmation must exist and must NOT be blank ────────
        const confirmation = await pollForMessage(
          request,
          studentToken,
          (m) => m.id > reminder!.id && m.messageType === "text",
          20_000,
        );
        expect(
          confirmation,
          "no confirmation message was sent back after declining — the engine went silent",
        ).not.toBeNull();

        // The core PAD-67 assertion: not empty, and equal to the built-in default.
        expect(
          (confirmation!.content ?? "").trim().length,
          `PAD-67 regression: the decline confirmation was delivered EMPTY (${JSON.stringify(confirmation!.content)})`,
        ).toBeGreaterThan(0);
        expect([DEFAULT_DECLINED_EN, DEFAULT_DECLINED_PT]).toContain(
          (confirmation!.content ?? "").trim(),
        );

        // And no message this decline produced is an empty bubble. Scoped to
        // messages created after the reminder — the shared seed DB also holds
        // soft-deleted messages from the messaging specs, which legitimately
        // serialize with empty content and are not the engine's doing.
        const producedByThisFlow = (await getAllMessages(request, studentToken)).filter(
          (m) => m.id >= reminder!.id,
        );
        for (const m of producedByThisFlow) {
          expect(
            (m.content ?? "").trim().length,
            `an empty message (id ${m.id}, type ${m.messageType}) was delivered to the student`,
          ).toBeGreaterThan(0);
        }
      } finally {
        // Restore defaults so later specs don't inherit this coach's templates.
        await setCoachConfig(request, coachToken, { messageTemplates: {} });
      }
    },
  );
});
