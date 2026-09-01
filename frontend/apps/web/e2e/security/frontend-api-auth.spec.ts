/**
 * PAD-92 — `/api/app` (modules/frontend_api.py) must not expose unauthenticated
 * routes, and authenticated callers must not be able to reach another coach's
 * data (IDOR).
 *
 * Before PAD-92 roughly 25 routes on this blueprint carried no auth decorator
 * at all: anyone who could reach the API could add/edit/remove players, edit and
 * delete classes, and delete any coach's levels, evaluation categories and
 * player notes by bare id.
 *
 * This spec pins the contract at the HTTP level:
 *   * anonymous caller                     -> 401
 *   * authenticated coach, someone else's row -> 403 (and the row survives)
 *   * owner                                -> 2xx
 *   * legacy no-caller routes              -> 404 (deleted outright)
 *
 * It talks to the API directly (no UI) because the vulnerability is an HTTP-layer
 * one — the UI never sent these requests unauthenticated in the first place.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  COACH_USERNAME,
  COACH_PASSWORD,
  COACH_NOLEVELS_USERNAME,
  COACH_NOLEVELS_PASSWORD,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const API_BASE = API_APP;

async function getToken(
  request: APIRequestContext,
  username: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_AUTH}/login`, {
    data: { username, password },
  });
  expect(res.ok(), `login failed for ${username}: ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return (json.accessToken ?? json.access_token) as string;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Every route that PAD-92 moved from "no decorator" to "@jwt_required()".
 * Bodies are deliberately minimal — the guard must reject BEFORE any payload
 * validation runs, so a 400 here would be a failure just as much as a 200.
 */
const GUARDED_ROUTES: Array<{
  method: "post" | "get";
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}> = [
  { method: "post", path: "/add_player", body: { coachId: 1, name: "Anon" } },
  {
    method: "post",
    path: "/edit_player",
    body: { player: { playerId: 1, coachId: 1 }, updates: { name: "Anon" } },
  },
  { method: "post", path: "/remove_player", body: { coachId: 1, playerId: 1 } },
  {
    method: "post",
    path: "/edit_class",
    body: {
      event: { model: "LessonInstance", originalId: 1, date: "2030-01-01" },
      scope: "single",
      updates: { name: "pwned" },
    },
  },
  {
    method: "post",
    path: "/remove_class",
    body: {
      event: { model: "LessonInstance", originalId: 1, date: "2030-01-01" },
      scope: "single",
    },
  },
  { method: "post", path: "/delete/coach_note", body: { id: 1 } },
  { method: "post", path: "/delete/coach_level", body: { id: 1 } },
  { method: "post", path: "/delete/evaluation_category", body: { id: 1 } },
  {
    method: "post",
    path: "/check_field_available",
    body: { model: "user", field: "username", value: "e2e-coach" },
  },
  { method: "post", path: "/incomplete_player", body: { coachId: 1, name: "Anon" } },
  {
    method: "get",
    path: "/calendar_event",
    query: { model: "lesson_instance", original_id: "1" },
  },
];

/** Legacy routes PAD-92 removed outright — nothing in the apps called them. */
const DELETED_ROUTES: Array<{ method: "post" | "get"; path: string }> = [
  { method: "post", path: "/club" },
  { method: "post", path: "/user" },
  { method: "post", path: "/player" },
  { method: "post", path: "/coach" },
  { method: "post", path: "/coach_level" },
  { method: "post", path: "/lesson" },
  { method: "post", path: "/calendar_block" },
  { method: "post", path: "/user/1" },
  { method: "post", path: "/club/1" },
  { method: "post", path: "/lesson/1" },
  { method: "post", path: "/calendar_block/1" },
  { method: "post", path: "/lesson/1/status" },
  { method: "get", path: "/lessons" },
  { method: "get", path: "/calendar_block" },
];

test.describe("PAD-92: /api/app authentication & ownership", () => {
  test("US-92a: every guarded route rejects an anonymous caller with 401", async ({
    request,
  }) => {
    const failures: string[] = [];

    for (const route of GUARDED_ROUTES) {
      const url = `${API_BASE}${route.path}`;
      const res =
        route.method === "post"
          ? await request.post(url, { data: route.body ?? {} })
          : await request.get(url, { params: route.query ?? {} });

      if (res.status() !== 401) {
        failures.push(
          `${route.method.toUpperCase()} ${route.path} -> ${res.status()} (expected 401)`,
        );
      }
    }

    expect(failures, `Unauthenticated routes still reachable:\n${failures.join("\n")}`).toEqual(
      [],
    );
  });

  test("US-92b: legacy no-caller routes are gone (404)", async ({ request }) => {
    const failures: string[] = [];

    for (const route of DELETED_ROUTES) {
      const url = `${API_BASE}${route.path}`;
      const res =
        route.method === "post"
          ? await request.post(url, { data: {} })
          : await request.get(url);

      // 404 (route removed) or 405 (path still matched by a sibling rule with a
      // different method) are both acceptable — what must NOT happen is the
      // handler running.
      if (![404, 405].includes(res.status())) {
        failures.push(
          `${route.method.toUpperCase()} ${route.path} -> ${res.status()} (expected 404/405)`,
        );
      }
    }

    expect(failures, `Legacy routes still served:\n${failures.join("\n")}`).toEqual([]);
  });

  test("US-92c: another coach cannot delete a level they do not own (403)", async ({
    request,
  }) => {
    const ownerToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const otherToken = await getToken(
      request,
      COACH_NOLEVELS_USERNAME,
      COACH_NOLEVELS_PASSWORD,
    );

    const levelsRes = await request.get(`${API_BASE}/coach_levels`, {
      headers: bearer(ownerToken),
    });
    expect(levelsRes.ok()).toBeTruthy();
    const levels = (await levelsRes.json()) as Array<{ id: number }>;
    expect(levels.length, "seed must give e2e-coach at least one level").toBeGreaterThan(0);
    const victimLevelId = levels[0].id;

    const attack = await request.post(`${API_BASE}/delete/coach_level`, {
      headers: bearer(otherToken),
      data: { id: victimLevelId },
    });
    expect(
      attack.status(),
      "a logged-in coach must not delete another coach's level",
    ).toBe(403);

    // …and the level must still be there.
    const after = await request.get(`${API_BASE}/coach_levels`, {
      headers: bearer(ownerToken),
    });
    const afterLevels = (await after.json()) as Array<{ id: number }>;
    expect(afterLevels.some((l) => l.id === victimLevelId)).toBe(true);
  });

  test("US-92d: another coach cannot delete an evaluation category they do not own (403)", async ({
    request,
  }) => {
    const ownerToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const otherToken = await getToken(
      request,
      COACH_NOLEVELS_USERNAME,
      COACH_NOLEVELS_PASSWORD,
    );

    const catRes = await request.get(`${API_BASE}/evaluation_categories`, {
      headers: bearer(ownerToken),
    });
    expect(catRes.ok()).toBeTruthy();
    const categories = (await catRes.json()) as Array<{ id: number }>;
    test.skip(categories.length === 0, "seed has no evaluation categories");
    const victimId = categories[0].id;

    const attack = await request.post(`${API_BASE}/delete/evaluation_category`, {
      headers: bearer(otherToken),
      data: { id: victimId },
    });
    expect(attack.status()).toBe(403);

    const after = await request.get(`${API_BASE}/evaluation_categories`, {
      headers: bearer(ownerToken),
    });
    const afterCats = (await after.json()) as Array<{ id: number }>;
    expect(afterCats.some((c) => c.id === victimId)).toBe(true);
  });

  test("US-92e: another coach cannot remove a player from someone else's roster (403)", async ({
    request,
  }) => {
    const ownerToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    const otherToken = await getToken(
      request,
      COACH_NOLEVELS_USERNAME,
      COACH_NOLEVELS_PASSWORD,
    );

    const playersRes = await request.get(`${API_BASE}/coach_players`, {
      headers: bearer(ownerToken),
    });
    expect(playersRes.ok()).toBeTruthy();
    const players = (await playersRes.json()) as Array<{ playerId?: number; id?: number }>;
    expect(players.length).toBeGreaterThan(0);
    const victimPlayerId = players[0].playerId ?? players[0].id;

    const attack = await request.post(`${API_BASE}/remove_player`, {
      headers: bearer(otherToken),
      data: { coachId: 999999, playerId: victimPlayerId },
    });
    expect(
      [403, 404].includes(attack.status()),
      `expected 403/404, got ${attack.status()}`,
    ).toBeTruthy();

    // The victim's roster is untouched.
    const after = await request.get(`${API_BASE}/coach_players`, {
      headers: bearer(ownerToken),
    });
    const afterPlayers = (await after.json()) as Array<{ playerId?: number; id?: number }>;
    expect(afterPlayers.length).toBe(players.length);
  });

  test("US-92f: the owning coach can still use the guarded routes (200)", async ({
    request,
  }) => {
    const token = await getToken(request, COACH_USERNAME, COACH_PASSWORD);

    // check_field_available — scope now comes from the JWT, not the body.
    const check = await request.post(`${API_BASE}/check_field_available`, {
      headers: bearer(token),
      data: { model: "user", field: "username", value: "definitely-free-username-92" },
    });
    expect(check.status()).toBe(200);
    expect((await check.json()).available).toBe(true);

    // calendar_event on the coach's own seeded class.
    const eventsRes = await request.get(`${API_BASE}/lesson_instances`, {
      headers: bearer(token),
      params: {
        from: new Date(Date.now() - 30 * 864e5).toISOString(),
        to: new Date(Date.now() + 60 * 864e5).toISOString(),
      },
    });
    expect(eventsRes.ok()).toBeTruthy();
    const events = (await eventsRes.json()) as Array<{
      model: string;
      originalId: number;
    }>;
    expect(events.length).toBeGreaterThan(0);

    const detail = await request.get(`${API_BASE}/calendar_event`, {
      headers: bearer(token),
      params: {
        model: events[0].model === "Lesson" ? "lesson" : "lesson_instance",
        original_id: String(events[0].originalId),
      },
    });
    expect(detail.status()).toBe(200);
  });

  test("US-92g: the debug reminder endpoint is not reachable anonymously", async ({
    request,
  }) => {
    const res = await request.post(
      `${API_APP}/notify/debug/schedule_reminder_test`,
      { data: { secondsUntilReminderFires: 3600 } },
    );
    // E2E_DEBUG_ENDPOINTS is on in this environment, so the env gate lets the
    // request through — the JWT guard must still reject it.
    expect(res.status()).toBe(401);
  });
});
