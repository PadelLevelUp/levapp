import { test, expect, type APIRequestContext } from "@playwright/test";
import { COACH_PASSWORD, COACH_USERNAME, loginAsStudent2, STUDENT2_PASSWORD, STUDENT2_USERNAME } from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";
import { ui } from "../helpers/i18n";

/**
 * PAD-492 — messaging.messages rule 6 and conversation-detail rule 16.
 *
 * A message the app generated carries one small line under its text ("Automatic LevApp
 * message", `message-automatic-note`); a message a person typed never does. The automatic
 * message here is a shared evaluation (`message_type: "system"`), sent by the coach through
 * the real share endpoint; the typed one is posted by the student into the same thread.
 * Asserted by test id and by the server's own `isAutomatic`, never by rendered copy alone.
 */

async function tokenFor(request: APIRequestContext, username: string, password: string) {
  const res = await request.post(`${API_AUTH}/login`, { data: { username, password } });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

test("PAD-492: an automatic message carries the note and a typed one does not", async ({
  page,
  request,
}) => {
  const coach = { Authorization: `Bearer ${await tokenFor(request, COACH_USERNAME, COACH_PASSWORD)}` };
  const student = {
    Authorization: `Bearer ${await tokenFor(request, STUDENT2_USERNAME, STUDENT2_PASSWORD)}`,
  };

  // The coach ↔ e2e-student-2 thread (find-or-create).
  const conv = await request.post(`${API_APP}/conversation`, {
    headers: student,
    data: { otherUsername: COACH_USERNAME },
  });
  expect(conv.status()).toBeLessThan(400);
  const conversationId = String((await conv.json()).id);

  try {
    // A typed message from the student.
    const typedText = `PAD-492 typed ${Date.now()}`;
    const typed = await request.post(`${API_APP}/message`, {
      headers: student,
      data: { conversationId, text: typedText },
    });
    expect(typed.status()).toBeLessThan(400);
    const typedBody = await typed.json();
    expect(typedBody.isAutomatic).toBe(false);

    // An automatic message: the coach shares a rated evaluation with the student.
    const roster = await (await request.get(`${API_APP}/coach_players`, { headers: coach })).json();
    const players = roster.items ?? roster;
    const studentTwo = players.find((p: { name?: string }) => p.name === "E2E Student Two");
    expect(studentTwo, "the seed must provide E2E Student Two on the coach's roster").toBeTruthy();
    const history = await (
      await request.get(`${API_APP}/player/${studentTwo.playerId}/evaluations`, { headers: coach })
    ).json();
    const record = history.records.find((r: { ratings: unknown[] }) => r.ratings.length > 0);
    expect(record, "the seed must provide a rated evaluation for E2E Student Two").toBeTruthy();
    await request.delete(`${API_APP}/evaluation_record/${record.id}/share`, { headers: coach });
    const shared = await request.post(`${API_APP}/evaluation_record/${record.id}/share`, {
      headers: coach,
      data: { categoryIds: [record.ratings[0].categoryId], evolution: "none", includeNote: false },
    });
    expect(shared.status()).toBeLessThan(400);

    const thread = await (
      await request.get(`${API_APP}/conversation/${conversationId}?limit=50`, { headers: student })
    ).json();
    const automatic = [...thread.messages].reverse().find((m: { isAutomatic?: boolean }) => m.isAutomatic);
    expect(automatic, "the share must arrive as an automatic message").toBeTruthy();

    await loginAsStudent2(page);
    await page.goto(`/messages/${conversationId}`);

    const autoRow = page.getByTestId(`message-item-${automatic.id}`);
    await expect(autoRow).toBeVisible({ timeout: 20000 });
    await expect(autoRow.getByTestId("message-automatic-note")).toHaveText(ui("messages.automaticMessage"));

    const typedRow = page.getByTestId(`message-item-${typedBody.id}`);
    await expect(typedRow).toBeVisible();
    await expect(typedRow.getByTestId("message-automatic-note")).toHaveCount(0);

    await request.delete(`${API_APP}/evaluation_record/${record.id}/share`, { headers: coach });
  } finally {
    // R-040: the student's typed message is unread for the coach; leaving it kept the coach's nav
    // badge at 1 for every later spec, and nav-unread-badge failed after this one (B-286, PAD-514).
    await request.post(`${API_APP}/conversation/${conversationId}/read`, { headers: coach });
  }
});
