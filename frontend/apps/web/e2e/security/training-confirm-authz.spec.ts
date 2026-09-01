/**
 * PAD-115 — `POST /api/app/class_instance/training/confirm` must resolve the
 * acting coach and assert ownership before it writes.
 *
 * Before PAD-115 this route was `@jwt_required()` but never resolved the
 * caller: it read `classInstance` and `exerciseIds` straight out of the body
 * and handed them to the service. PAD-92 hardened the routes that carried no
 * decorator, and PAD-103 hardened the ones that crashed on a null coach — this
 * one was missed by both, because it neither 401'd nor 500'd. It silently
 * succeeded, so any authenticated user could write a training plan onto any
 * coach's class by enumerating instance ids.
 *
 * Contract pinned here at the HTTP level:
 *   anonymous                          -> 401
 *   student (no coach profile)         -> 403
 *   another coach, someone else's class-> 403, and the owner's plan survives
 *   own class, unreachable exercise    -> 403, nothing written
 *   owner, own exercise                -> 200
 *
 * Spec: specs/training/spec.md -> training.lesson-planning, rules 5-8.
 *
 * Talks to the API directly rather than through the UI: the vulnerability is an
 * HTTP-layer one, and the UI never offered these requests in the first place.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  COACH_USERNAME,
  COACH_PASSWORD,
  COACH_NOLEVELS_USERNAME,
  COACH_NOLEVELS_PASSWORD,
  STUDENT_USERNAME,
  STUDENT_PASSWORD,
} from "../helpers/auth";
import { API_APP, API_AUTH } from "../helpers/api";

const API_BASE = API_APP;
const CONFIRM = `${API_BASE}/class_instance/training/confirm`;

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

async function createExercise(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.post(`${API_BASE}/exercises`, {
    headers: bearer(token),
    data: { name, type: "attack", difficulty: 3 },
  });
  expect(res.ok(), `exercise create failed: ${res.status()}`).toBeTruthy();
  return String((await res.json()).id);
}

/** The coach's own seeded class, in the shape the calendar sends back. */
async function ownClassInstance(
  request: APIRequestContext,
  token: string,
): Promise<Record<string, unknown>> {
  const listRes = await request.get(`${API_BASE}/lesson_instances`, {
    headers: bearer(token),
    params: {
      from: new Date(Date.now() - 30 * 864e5).toISOString(),
      to: new Date(Date.now() + 60 * 864e5).toISOString(),
    },
  });
  expect(listRes.ok()).toBeTruthy();
  const events = (await listRes.json()) as Array<{
    model: string;
    originalId: number;
  }>;
  // A materialized occurrence — that is the shape carrying `parentClassId`,
  // which is what routes the request down the LessonInstance branch.
  const instanceEvent = events.find((e) => e.model !== "Lesson");
  expect(instanceEvent, "seed has no materialized lesson instance").toBeTruthy();

  const detail = await request.get(`${API_BASE}/calendar_event`, {
    headers: bearer(token),
    params: {
      model: "lesson_instance",
      original_id: String(instanceEvent!.originalId),
    },
  });
  expect(detail.status()).toBe(200);
  return (await detail.json()) as Record<string, unknown>;
}

/**
 * Read the class's saved plan back.
 *
 * Must go through `/class_instance`, NOT `/calendar_event`: the two use
 * different serializers, and only `serialize_class_instance` populates
 * `plannedExerciseIds`. `/calendar_event` returns the key as null regardless of
 * what is stored, so reading the plan there reports an empty plan for every
 * class and would make these assertions vacuous.
 */
async function plannedIds(
  request: APIRequestContext,
  token: string,
  originalId: string,
): Promise<string[]> {
  const res = await request.post(
    `${API_BASE}/class_instance?model=lessoninstance&id=${originalId}`,
    { headers: bearer(token) },
  );
  expect(res.status()).toBe(200);
  return ((await res.json()).plannedExerciseIds ?? []) as string[];
}

test.describe.serial("PAD-115: training confirm is coach-scoped", () => {
  let coachToken: string;
  let otherCoachToken: string;
  let studentToken: string;
  let ownExercise: string;
  let foreignExercise: string;
  let classInstance: Record<string, unknown>;
  let originalId: string;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();

    coachToken = await getToken(request, COACH_USERNAME, COACH_PASSWORD);
    otherCoachToken = await getToken(
      request,
      COACH_NOLEVELS_USERNAME,
      COACH_NOLEVELS_PASSWORD,
    );
    studentToken = await getToken(request, STUDENT_USERNAME, STUDENT_PASSWORD);

    ownExercise = await createExercise(request, coachToken, "PAD-115 own drill");
    foreignExercise = await createExercise(
      request,
      otherCoachToken,
      "PAD-115 foreign drill",
    );

    classInstance = await ownClassInstance(request, coachToken);
    originalId = String(classInstance.originalId);

    // Give the owner a plan, so "the owner's plan survives" is a real
    // assertion and not just "nothing appeared out of nowhere". The pre-fix
    // service deleted every row for the instance before inserting, so a
    // successful attack wiped the owner's plan even when it wrote nothing.
    const seedPlan = await request.post(CONFIRM, {
      headers: bearer(coachToken),
      data: { classInstance, exerciseIds: [ownExercise] },
    });
    expect(seedPlan.status()).toBe(200);

    await request.dispose();
  });

  test.afterAll(async ({ playwright }) => {
    // Leave the shared seed DB as we found it — the whole suite runs serially
    // against one database, so a leaked plan or a stray exercise becomes
    // somebody else's mystery flake. Cleanup is asserted, not fire-and-forget:
    // a silent failure here is exactly the kind that surfaces three specs later.
    const request = await playwright.request.newContext();

    const cleared = await request.post(CONFIRM, {
      headers: bearer(coachToken),
      data: { classInstance, exerciseIds: [] },
    });
    expect(cleared.status(), "cleanup: clearing the plan failed").toBe(200);

    for (const [id, token] of [
      [ownExercise, coachToken],
      [foreignExercise, otherCoachToken],
    ] as const) {
      const del = await request.delete(`${API_BASE}/exercises/${id}`, {
        headers: bearer(token),
      });
      // 404 is fine — it means it was already gone.
      expect(
        [204, 200, 404].includes(del.status()),
        `cleanup: deleting exercise ${id} returned ${del.status()}`,
      ).toBeTruthy();
    }

    expect(
      await plannedIds(request, coachToken, originalId),
      "cleanup: the class still has a training plan",
    ).toEqual([]);

    await request.dispose();
  });

  test("US-115a: an anonymous caller is rejected with 401", async ({
    request,
  }) => {
    const res = await request.post(CONFIRM, {
      data: { classInstance, exerciseIds: [ownExercise] },
    });

    expect(res.status()).toBe(401);
    expect(await plannedIds(request, coachToken, originalId)).toEqual([
      ownExercise,
    ]);
  });

  test("US-115b: a student is rejected with 403, not 500", async ({
    request,
  }) => {
    const res = await request.post(CONFIRM, {
      headers: bearer(studentToken),
      data: { classInstance, exerciseIds: [ownExercise] },
    });

    // Exact status: the neighbouring failure mode on this blueprint is a 500,
    // so `not 200` would pass against unfixed code.
    expect(res.status()).toBe(403);
    expect(await plannedIds(request, coachToken, originalId)).toEqual([
      ownExercise,
    ]);
  });

  test("US-115c: another coach cannot plan training on a class they do not own", async ({
    request,
  }) => {
    const res = await request.post(CONFIRM, {
      headers: bearer(otherCoachToken),
      data: { classInstance, exerciseIds: [foreignExercise] },
    });

    expect(res.status()).toBe(403);
    // The owner's plan is intact — not replaced, not emptied.
    expect(await plannedIds(request, coachToken, originalId)).toEqual([
      ownExercise,
    ]);
  });

  test("US-115d: a coach cannot plan an exercise outside their own library", async ({
    request,
  }) => {
    const res = await request.post(CONFIRM, {
      headers: bearer(coachToken),
      data: {
        classInstance,
        // Own class, but one id belongs to the other coach: the whole request
        // is rejected, so no partial plan is written from the mixed batch.
        exerciseIds: [ownExercise, foreignExercise],
      },
    });

    expect(res.status()).toBe(403);
    expect(await plannedIds(request, coachToken, originalId)).toEqual([
      ownExercise,
    ]);
  });

  test("US-115e: the owning coach can still plan their own exercise", async ({
    request,
  }) => {
    const res = await request.post(CONFIRM, {
      headers: bearer(coachToken),
      data: { classInstance, exerciseIds: [ownExercise] },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).plannedExerciseIds).toEqual([ownExercise]);
    expect(await plannedIds(request, coachToken, originalId)).toEqual([
      ownExercise,
    ]);
  });
});
