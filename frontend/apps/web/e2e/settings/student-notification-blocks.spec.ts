/**
 * PAD-112 — a student can block class-vacancy invitation notifications from
 * their own Settings, at three independent levels, with a free-text reason
 * their coach can read.
 *
 * Three halves, deliberately:
 *
 *   * the STUDENT UI half — the section exists, the three toggles persist
 *     independently, and "block everything" is gated behind a confirmation
 *     dialog carrying the unjustified-absence consequence;
 *   * the SUPPRESSION half — the decisive one. A toggle that saves but does not
 *     actually stop the invitation is the failure mode this ticket exists to
 *     prevent, so this asserts against the live stack that a blocked student is
 *     skipped and reported BY NAME, not merely that a checkbox stayed checked;
 *   * the COACH UI half — the "notifications cut" signal and the student's own
 *     reason are visible on the player record.
 *
 * Every test restores the preferences to "receives everything" afterwards: the
 * seed DB is shared across specs, and a student left blocked would silently
 * suppress invitations in the notification-engine specs.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  loginAsCoach,
  loginAsStudent,
  COACH_USERNAME,
  COACH_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { openSettings, openPlayers } from "../helpers/navigation";

const API_ROOT = "http://localhost:5001/api";
const API_BASE = `${API_ROOT}/app`;

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_ROOT}/auth/login`, {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const CLEARED = {
  blockAutoInvitations: false,
  blockManualInvitations: false,
  blockAllNotifications: false,
  notificationBlockReason: "",
};

async function setStudentPrefs(
  request: APIRequestContext,
  prefs: Record<string, unknown>,
) {
  const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
  const res = await request.patch(`${API_ROOT}/auth/me`, {
    headers: bearer(token),
    data: prefs,
  });
  expect(res.status(), "PATCH /auth/me").toBe(200);
  return res;
}

async function openMyNotifications(page: Page) {
  await openSettings(page);
  await page.getByTestId("settings-nav-myNotifications").click();
  await expect(page.getByTestId("student-notification-blocks")).toBeVisible({
    timeout: 10_000,
  });
}

// Every spec here leaves the shared student unblocked.
test.afterEach(async ({ request }) => {
  await setStudentPrefs(request, CLEARED);
});

// ---------------------------------------------------------------------------
// Student UI
// ---------------------------------------------------------------------------

test.describe("PAD-112: the student's notification preferences", () => {
  test("PAD-112: the section is offered to a student and starts unblocked", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await openMyNotifications(page);

    for (const id of [
      "student-notif-block-auto",
      "student-notif-block-manual",
      "student-notif-block-all",
    ]) {
      await expect(page.getByTestId(id)).toHaveAttribute("data-state", "unchecked");
    }
  });

  test("PAD-112: blocking automatic invitations persists with its reason", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await openMyNotifications(page);

    await page.getByTestId("student-notif-block-auto").click();
    await page.getByTestId("student-notif-reason").fill("Estou lesionado");
    await page.getByTestId("student-notif-save").click();

    // Reload rather than trusting local state — the bug this guards against is
    // a save that reports success without persisting.
    await page.reload();
    await page.getByTestId("settings-nav-myNotifications").click();

    await expect(page.getByTestId("student-notif-block-auto")).toHaveAttribute(
      "data-state",
      "checked",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("student-notif-reason")).toHaveValue(
      "Estou lesionado",
    );
    // Independent levels: the other two were never touched.
    await expect(page.getByTestId("student-notif-block-manual")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    await expect(page.getByTestId("student-notif-block-all")).toHaveAttribute(
      "data-state",
      "unchecked",
    );
  });

  test("PAD-112: 'block everything' warns about unjustified absences", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await openMyNotifications(page);

    await page.getByTestId("student-notif-block-all").click();

    const dialog = page.getByTestId("student-notif-confirm-all");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/injustificada|unjustified/i);

    // Cancelling must leave the toggle off and write nothing.
    await page.getByTestId("student-notif-confirm-cancel").click();
    await expect(page.getByTestId("student-notif-block-all")).toHaveAttribute(
      "data-state",
      "unchecked",
    );

    // Confirming applies it.
    await page.getByTestId("student-notif-block-all").click();
    await page.getByTestId("student-notif-confirm-accept").click();
    await expect(page.getByTestId("student-notif-block-all")).toHaveAttribute(
      "data-state",
      "checked",
    );

    await page.getByTestId("student-notif-save").click();
    await page.reload();
    await page.getByTestId("settings-nav-myNotifications").click();
    await expect(page.getByTestId("student-notif-block-all")).toHaveAttribute(
      "data-state",
      "checked",
      { timeout: 10_000 },
    );
  });

  test("PAD-112: an explicit un-block is persisted", async ({ page, request }) => {
    await setStudentPrefs(request, { blockAutoInvitations: true });

    await loginAsStudent(page);
    await openMyNotifications(page);
    await expect(page.getByTestId("student-notif-block-auto")).toHaveAttribute(
      "data-state",
      "checked",
      { timeout: 10_000 },
    );

    await page.getByTestId("student-notif-block-auto").click();
    await page.getByTestId("student-notif-save").click();

    await page.reload();
    await page.getByTestId("settings-nav-myNotifications").click();
    // The PAD-93 boolean trap: `false` must survive a partial update, not be
    // swallowed as "no value supplied".
    await expect(page.getByTestId("student-notif-block-auto")).toHaveAttribute(
      "data-state",
      "unchecked",
      { timeout: 10_000 },
    );
  });

  test("PAD-112: there is no notification-block control on the calendar", async ({
    page,
  }) => {
    await loginAsStudent(page);
    await page.goto("/calendar");
    await page.waitForURL("**/calendar");
    await expect(page.getByTestId("student-notif-block-auto")).toHaveCount(0);
    await expect(page.getByTestId("student-notification-blocks")).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Suppression — the part that actually matters
// ---------------------------------------------------------------------------

test.describe("PAD-112: a blocked student is not solicited", () => {
  async function seededInstanceRef(request: APIRequestContext, token: string) {
    // The seed's "E2E Academy Class" is next Monday at 10:00; find it through
    // the coach's own calendar rather than hardcoding an id or a date. The
    // window is deliberately wide (a year either side) so this keeps working
    // whenever the seed is re-run.
    const from = new Date(Date.now() - 365 * 864e5).toISOString();
    const to = new Date(Date.now() + 365 * 864e5).toISOString();
    const res = await request.get(`${API_BASE}/calendar`, {
      headers: bearer(token),
      params: { from, to },
    });
    expect(res.status(), "GET /app/calendar").toBe(200);
    const body = await res.json();
    const events: any[] = Array.isArray(body) ? body : (body.events ?? []);
    const target = events.find((e) => /E2E Academy Class/i.test(e.title ?? ""));
    expect(target, "seeded 'E2E Academy Class' not found on the calendar").toBeTruthy();
    return {
      model: target.model ?? "LessonInstance",
      originalId: String(target.originalId ?? target.id),
      date: target.date,
    };
  }

  async function studentPlayerId(request: APIRequestContext, coachToken: string) {
    const res = await request.get(`${API_BASE}/coach_players`, {
      headers: bearer(coachToken),
    });
    expect(res.status()).toBe(200);
    const players = await res.json();
    const student = players.find((p: any) => p.username === STUDENT_USERNAME);
    expect(student, `seeded student ${STUDENT_USERNAME} not in the roster`).toBeTruthy();
    return student.playerId;
  }

  test("PAD-112: a manual invitation to a blocked student is skipped and reported", async ({
    request,
  }) => {
    const coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const playerId = await studentPlayerId(request, coachToken);
    const ref = await seededInstanceRef(request, coachToken);

    await setStudentPrefs(request, {
      blockManualInvitations: true,
      notificationBlockReason: "Estou lesionado",
    });

    const res = await request.post(`${API_BASE}/notify/manual`, {
      headers: bearer(coachToken),
      data: { ...ref, playerIds: [playerId] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // The decisive assertion: nothing was sent, and the coach is told why.
    expect(body.sent, "a blocked student must not be invited").toBe(0);
    expect(body.blocked, "the coach must be told who was skipped").toHaveLength(1);
    expect(body.blocked[0].playerId).toBe(Number(playerId));
    expect(body.blocked[0].reason).toBe("Estou lesionado");
  });

  test("PAD-112: blocking only AUTO leaves a manual invitation working", async ({
    request,
  }) => {
    const coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const playerId = await studentPlayerId(request, coachToken);
    const ref = await seededInstanceRef(request, coachToken);

    await setStudentPrefs(request, { blockAutoInvitations: true });

    const res = await request.post(`${API_BASE}/notify/manual`, {
      headers: bearer(coachToken),
      data: { ...ref, playerIds: [playerId] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Independence: the three levels do not leak into one another.
    expect(body.sent).toBe(1);
    expect(body.blocked ?? []).toHaveLength(0);
  });

  test("PAD-112: the preferences stay open to a student caller", async ({
    request,
  }) => {
    const token = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    const res = await request.get(`${API_ROOT}/auth/me`, {
      headers: bearer(token),
    });
    expect(res.status()).toBe(200);
    const me = await res.json();
    for (const key of [
      "blockAutoInvitations",
      "blockManualInvitations",
      "blockAllNotifications",
      "notificationBlockReason",
    ]) {
      expect(me, `GET /auth/me must expose ${key}`).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Coach UI
// ---------------------------------------------------------------------------

test.describe("PAD-112: the coach sees the signal and the reason", () => {
  test("PAD-112: the player record shows 'notifications cut' and the student's reason", async ({
    page,
    request,
  }) => {
    await setStudentPrefs(request, {
      blockAutoInvitations: true,
      notificationBlockReason: "Vou estar fora até setembro",
    });

    await loginAsCoach(page);
    await openPlayers(page);

    await page
      .getByText(new RegExp(STUDENT_USERNAME, "i"))
      .first()
      .click()
      .catch(async () => {
        // The card shows the display name, not the username, in some layouts.
        await page.getByText(/E2E Student/i).first().click();
      });

    await expect(
      page.getByTestId("player-notifications-blocked-badge"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByTestId("player-notifications-blocked-reason"),
    ).toContainText("Vou estar fora até setembro");
  });

  test("PAD-112: an unblocked student shows no signal", async ({
    page,
    request,
  }) => {
    await setStudentPrefs(request, CLEARED);

    await loginAsCoach(page);
    await openPlayers(page);
    await page.getByText(/E2E Student/i).first().click();

    await expect(page.getByTestId("player-notifications-blocked-badge")).toHaveCount(0);
    await expect(page.getByTestId("player-notifications-blocked-detail")).toHaveCount(0);
  });
});
