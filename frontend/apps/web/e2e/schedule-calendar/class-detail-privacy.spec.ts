/**
 * PAD-36 — Role-based visibility of class detail.
 *
 * A student who views a class must NOT receive other students' restricted data
 * (full participant list, who received open-spot notifications, other students'
 * presence/absence records). A coach keeps the full view.
 *
 * Spec: classes.detail-visibility
 *
 * This is an API-contract E2E: it asserts what the backend actually returns to a
 * student vs a coach, which is where the privacy leak lives. UI hiding alone is
 * not sufficient — the payload itself must be filtered server-side.
 *
 * Run a single test:
 *   npx playwright test e2e/schedule-calendar/class-detail-privacy.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";

const API_BASE = "http://localhost:5001/api/app";
const AUTH_BASE = "http://localhost:5001/api/auth";

// The seeded "E2E Academy Class" materialized instance has id 1 and enrolls
// e2e-student (student 1). e2e-student-2 is a separate coach player used as the
// "other student" whose data must never leak to student 1.
const INSTANCE_ID = 1;

async function apiToken(
  request: APIRequestContext,
  username: string,
  password: string
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/login`, {
    data: { username, password },
  });
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

async function getClassInstance(
  request: APIRequestContext,
  token: string,
  instanceId: number
) {
  const res = await request.post(
    `${API_BASE}/class_instance?model=lessoninstance&id=${instanceId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(res.status(), "class_instance must return 200").toBe(200);
  return res.json();
}

test("PAD-36: student does not receive other students' class data; coach does", async ({
  request,
}) => {
  const coachToken = await apiToken(request, "e2e-coach", "E2eCoach123!");
  const studentToken = await apiToken(request, "e2e-student", "E2eStudent123!");

  // Resolve player ids from the coach's player list.
  const playersRes = await request.get(`${API_BASE}/players`, {
    headers: { Authorization: `Bearer ${coachToken}` },
  });
  const players = await playersRes.json();
  const student1 = players.find(
    (p: any) => p.email === "e2e-student@test.com" || p.name === "E2E Student"
  );
  const student2 = players.find(
    (p: any) =>
      p.email === "e2e-student-2@test.com" || p.name === "E2E Student Two"
  );
  expect(student1, "e2e-student must exist").toBeTruthy();
  expect(student2, "e2e-student-2 must exist").toBeTruthy();

  // Coach sends an open-spot notification to student 2 for this instance,
  // creating a NotificationEvent (an "invitation") that is coach-only info.
  await request.post(`${API_BASE}/notify/manual`, {
    headers: { Authorization: `Bearer ${coachToken}` },
    data: {
      model: "LessonInstance",
      originalId: INSTANCE_ID,
      date: null,
      playerIds: [student2.id],
    },
  });

  // ---- Coach view: full data ----
  const coachView = await getClassInstance(request, coachToken, INSTANCE_ID);
  const coachInvitationPlayerIds = (coachView.invitations ?? []).map((i: any) =>
    String(i.playerId)
  );
  expect(
    coachInvitationPlayerIds,
    "coach must see the notification sent to student 2"
  ).toContain(String(student2.id));

  // ---- Student view: only their own data ----
  const studentView = await getClassInstance(
    request,
    studentToken,
    INSTANCE_ID
  );

  const participantIds = (studentView.participants ?? []).map((p: any) =>
    String(p.id)
  );
  expect(
    participantIds,
    "student must NOT see other students in participants"
  ).not.toContain(String(student2.id));

  const presencePlayerIds = (studentView.presences ?? []).map((p: any) =>
    String(p.playerId)
  );
  expect(
    presencePlayerIds,
    "student must NOT see other students' presence/absence records"
  ).not.toContain(String(student2.id));

  const invitationPlayerIds = (studentView.invitations ?? []).map((i: any) =>
    String(i.playerId)
  );
  expect(
    invitationPlayerIds,
    "student must NOT see who else received open-spot notifications"
  ).not.toContain(String(student2.id));

  // Student still sees the shared, non-sensitive class info.
  expect(studentView.name, "student still sees class name").toBeTruthy();
});
