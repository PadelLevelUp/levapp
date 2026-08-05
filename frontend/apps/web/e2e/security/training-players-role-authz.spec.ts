/**
 * PAD-116 — the coach-only Training and Players endpoints must answer a student
 * caller with a deliberate 403, never a 500.
 *
 * Follow-up to PAD-103 (Settings) and sibling to PAD-92's spec in this folder.
 *
 * Worth knowing before reading the assertions: the ticket lists 13 routes and
 * says all of them 500. Measured against `main` before the fix, only four did —
 * `/players`, `/coach_players`, `/coach_players_paginated`, `/player_profile`.
 * The nine exercise/exercise-group routes already returned 403, but only
 * because every service behind them opens with its own `if coach is None`
 * guard; the routes themselves passed a `None` coach straight through. So this
 * spec pins a real fix for four routes and a previously-accidental contract for
 * the other nine, which is what stops a later service refactor from quietly
 * turning them back into 500s.
 *
 * Runs against real Postgres rather than the unit suite's SQLite, which matters
 * for `/players`: it also dereferences `current_club()`, a second null-coach
 * path that the route-level guard now short-circuits.
 *
 * Statuses are asserted with toBe, never "not 200" — the failure mode being
 * fixed IS a 500, so a loose assertion passes against unfixed code.
 *
 * Specs: players.list rule 7, players.profile rule 7, training.exercises rule 9,
 * training.groups rule 6.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  COACH_USERNAME,
  COACH_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";

const API_BASE = "http://localhost:5001/api/app";

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post("http://localhost:5001/api/auth/login", {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Every route PAD-116 converts. Ids are deliberately arbitrary: the role check
 *  must fire before the row is ever looked up, so a 404 here would be as much
 *  of a failure as a 200. */
const CONVERTED: Array<{
  label: string;
  method: "get" | "post" | "put" | "delete";
  path: string;
  body?: Record<string, unknown>;
}> = [
  { label: "exercises.list", method: "get", path: "/exercises" },
  { label: "exercises.detail", method: "get", path: "/exercises/1" },
  {
    label: "exercises.create",
    method: "post",
    path: "/exercises",
    body: { name: "pad116", type: "attack", difficulty: 3 },
  },
  {
    label: "exercises.update",
    method: "put",
    path: "/exercises/1",
    body: { name: "pad116" },
  },
  { label: "exercises.delete", method: "delete", path: "/exercises/1" },
  { label: "groups.list", method: "get", path: "/exercise-groups" },
  {
    label: "groups.create",
    method: "post",
    path: "/exercise-groups",
    body: { name: "pad116" },
  },
  {
    label: "groups.update",
    method: "put",
    path: "/exercise-groups/1",
    body: { name: "pad116" },
  },
  { label: "groups.delete", method: "delete", path: "/exercise-groups/1" },
  { label: "players.list", method: "get", path: "/players" },
  { label: "players.coachPlayers", method: "get", path: "/coach_players" },
  { label: "players.paginated", method: "get", path: "/coach_players_paginated" },
  { label: "players.profile", method: "get", path: "/player_profile/1" },
];

/** Branch on `current_coach() is None` on purpose to serve students. Hardening
 *  these would lock a student out of their own calendar. */
const MUST_STAY_OPEN = [
  {
    label: "calendar",
    path: "/calendar",
    params: {
      from: "2026-08-01T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
    },
  },
  {
    label: "dashboard",
    path: "/dashboard",
    params: {
      from: "2026-08-01T00:00:00Z",
      to: "2026-09-01T00:00:00Z",
    },
  },
  { label: "availabilityBlockers", path: "/availability_blockers" },
];

test.describe("PAD-116: coach-only Training/Players endpoints are role-scoped", () => {
  let studentToken: string;
  let coachToken: string;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    studentToken = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);
    coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    await request.dispose();
  });

  test("US-116a: every converted route answers a student with exactly 403", async ({
    request,
  }) => {
    const offenders: Record<string, number> = {};

    for (const route of CONVERTED) {
      const res = await request[route.method](`${API_BASE}${route.path}`, {
        headers: bearer(studentToken),
        ...(route.body ? { data: route.body } : {}),
      });
      if (res.status() !== 403) offenders[route.label] = res.status();
    }

    expect(
      offenders,
      `expected exactly 403 for a student caller, got: ${JSON.stringify(offenders)}`,
    ).toEqual({});
  });

  test("US-116b: no converted route produces a server error for a student", async ({
    request,
  }) => {
    // Stated separately from the 403 check because this is the regression that
    // actually shipped: a 500 here is an unhandled AttributeError, not a decision.
    const serverErrors: Record<string, number> = {};

    for (const route of CONVERTED) {
      const res = await request[route.method](`${API_BASE}${route.path}`, {
        headers: bearer(studentToken),
        ...(route.body ? { data: route.body } : {}),
      });
      if (res.status() >= 500) serverErrors[route.label] = res.status();
    }

    expect(
      serverErrors,
      `server errors for a student caller: ${JSON.stringify(serverErrors)}`,
    ).toEqual({});
  });

  test("US-116c: the student-facing routes are NOT hardened", async ({
    request,
  }) => {
    const offenders: Record<string, number> = {};

    for (const route of MUST_STAY_OPEN) {
      const res = await request.get(`${API_BASE}${route.path}`, {
        headers: bearer(studentToken),
        ...(route.params ? { params: route.params } : {}),
      });
      if (res.status() === 403 || res.status() >= 500) {
        offenders[route.label] = res.status();
      }
    }

    expect(
      offenders,
      `these must keep serving students: ${JSON.stringify(offenders)}`,
    ).toEqual({});
  });

  test("US-116d: a coach loses no access", async ({ request }) => {
    const offenders: Record<string, number> = {};

    for (const path of [
      "/exercises",
      "/exercise-groups",
      "/players",
      "/coach_players",
      "/coach_players_paginated",
    ]) {
      const res = await request.get(`${API_BASE}${path}`, {
        headers: bearer(coachToken),
      });
      if (res.status() !== 200) offenders[path] = res.status();
    }

    expect(
      offenders,
      `coach reads must still succeed: ${JSON.stringify(offenders)}`,
    ).toEqual({});
  });

  test("US-116e: an anonymous caller still gets 401, not 403", async ({
    request,
  }) => {
    // The role check must not displace the auth check (PAD-92 contract):
    // "no token" and "wrong role" are different answers.
    const offenders: Record<string, number> = {};

    for (const route of CONVERTED) {
      const res = await request[route.method](`${API_BASE}${route.path}`, {
        ...(route.body ? { data: route.body } : {}),
      });
      if (res.status() !== 401) offenders[route.label] = res.status();
    }

    expect(
      offenders,
      `expected 401 without a JWT, got: ${JSON.stringify(offenders)}`,
    ).toEqual({});
  });
});
