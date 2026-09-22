/**
 * PAD-341: specs that dirty the shared E2E database put it back.
 *
 * Every spec in a Playwright run shares one seeded database, and `--shard=N/M`
 * splits by the spec FILE LIST — so which specs share a database changes every
 * time a release adds or removes a spec file. A spec that leaves a class, an
 * accepted class request or an answered reminder behind is harmless in today's
 * grouping and breaks a neighbour in tomorrow's, in a file nobody touched.
 *
 * Two traps these helpers exist for:
 *
 * - **Removing a class does not close its class request.** `remove_class`
 *   deletes the lesson; `ClassRequest.lesson_id` is `SET NULL`, so the request
 *   stays `accepted` forever and every later "exactly one accepted row" count
 *   is off by one. No class-requests route closes an accepted request, so the
 *   superadmin editor's DELETE (the seeded coach is superadmin) is the only way.
 * - **Removing a materialised one-off class takes two passes.** A class the
 *   student cancelled has a `LessonInstance`; `remove_class` on it deletes the
 *   instance and leaves the non-recurring `Lesson`, which re-projects itself on
 *   the same date. Re-read the day and remove again until nothing matches.
 *
 * Cleanup failures are soft assertions: they fail the test that leaked, without
 * masking the error that sent the test into its `finally`.
 */
import { expect, type APIRequestContext } from "@playwright/test";
import { API_ROOT } from "./api";

export type Auth = Record<string, string>;
export type CalendarEvent = Record<string, unknown>;

/** Every calendar event on one local day, as the coach's calendar sees it. */
export async function dayEvents(request: APIRequestContext, auth: Auth, day: string): Promise<CalendarEvent[]> {
  const res = await request.get(`${API_ROOT}/app/calendar?from=${day}T00:00:00&to=${day}T23:59:59`, { headers: auth });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as CalendarEvent[];
}

/**
 * Remove every class on `day` matching `match`, re-reading the day between
 * passes until none is left (see the two-pass trap above).
 */
export async function removeClassesOnDay(
  request: APIRequestContext,
  auth: Auth,
  day: string,
  match: (event: CalendarEvent) => boolean,
  maxPasses = 4
): Promise<void> {
  let left: CalendarEvent[] = [];
  for (let pass = 0; pass < maxPasses; pass++) {
    left = (await dayEvents(request, auth, day)).filter((e) => e.type === "class" && match(e));
    if (left.length === 0) return;
    for (const event of left) {
      await request.post(`${API_ROOT}/app/remove_class`, { headers: auth, data: { event, scope: "single" } });
    }
  }
  left = (await dayEvents(request, auth, day)).filter((e) => e.type === "class" && match(e));
  expect.soft(left.map((e) => `${e.title} ${e.date} ${e.startTime}`), `classes left on ${day}`).toEqual([]);
}

/** Remove every hold/block on `day` whose title matches. */
export async function removeBlocksOnDay(
  request: APIRequestContext,
  auth: Auth,
  day: string,
  match: (event: CalendarEvent) => boolean
): Promise<void> {
  for (const e of await dayEvents(request, auth, day)) {
    if (e.type === "block" && match(e)) {
      await request.delete(`${API_ROOT}/app/calendar_block/${e.originalId}`, { headers: auth, data: { scope: "all" } });
    }
  }
}

/**
 * Delete class requests outright. `coachAuth` must be the seeded (superadmin)
 * coach. Pass the ids the spec itself created — never "all accepted", which
 * would clean up after a neighbour and hide that neighbour's leak.
 */
export async function deleteClassRequests(
  request: APIRequestContext,
  coachAuth: Auth,
  ids: Array<string | number>
): Promise<void> {
  for (const id of ids.filter((i) => String(i) !== "")) {
    const res = await request.delete(`${API_ROOT}/editor/classrequest/${id}`, { headers: coachAuth });
    expect.soft([200, 404], `delete class request ${id}: ${res.status()}`).toContain(res.status());
  }
}


/**
 * Withdraw class requests as the student who sent them, so their calendar hold
 * is released. Since PAD-360 an editor delete releases the hold too
 * (classes.class-requests rule 18), so this is no longer what keeps the
 * coach's calendar clean; it is kept because it is harmless and exercises the
 * product path. A request already closed answers 4xx, which is fine here.
 * Call it before `deleteClassRequests`.
 */
export async function withdrawClassRequests(
  request: APIRequestContext,
  studentAuth: Auth,
  ids: Array<string | number>
): Promise<void> {
  for (const id of ids.filter((i) => String(i) !== "")) {
    await request.post(`${API_ROOT}/app/class-requests/${id}/withdraw`, { headers: studentAuth, data: {} });
  }
}

/** Every id of an editor model — a snapshot taken before a spec creates rows it cannot address by id. */
export async function editorIds(request: APIRequestContext, coachAuth: Auth, model: string): Promise<Set<number>> {
  const ids = new Set<number>();
  for (let page = 1; ; page++) {
    const res = await request.get(`${API_ROOT}/editor/${model}?page=${page}`, { headers: coachAuth });
    expect(res.ok(), `editor list ${model}: ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { items: Array<{ id: number }>; pages: number };
    body.items.forEach((row) => ids.add(row.id));
    if (page >= body.pages) return ids;
  }
}

/** Delete the rows of `model` that did not exist in the `before` snapshot. */
export async function deleteNewEditorRows(
  request: APIRequestContext,
  coachAuth: Auth,
  model: string,
  before: Set<number>
): Promise<void> {
  for (const id of await editorIds(request, coachAuth, model)) {
    if (before.has(id)) continue;
    const res = await request.delete(`${API_ROOT}/editor/${model}/${id}`, { headers: coachAuth });
    expect.soft(res.ok(), `delete ${model} ${id}: ${res.status()}`).toBeTruthy();
  }
}

/**
 * PAD-358: delete join requests (`classes.join-requests`) — a different table from
 * `deleteClassRequests`' class requests, with its own editor model. Same rules: the
 * seeded (superadmin) coach, ids the spec itself created.
 */
export async function deleteClassJoinRequests(
  request: APIRequestContext,
  coachAuth: Auth,
  ids: Array<string | number>
): Promise<void> {
  for (const id of ids.filter((i) => String(i) !== "")) {
    const res = await request.delete(`${API_ROOT}/editor/classjoinrequest/${id}`, { headers: coachAuth });
    expect.soft([200, 404], `delete class join request ${id}: ${res.status()}`).toContain(res.status());
  }
}
