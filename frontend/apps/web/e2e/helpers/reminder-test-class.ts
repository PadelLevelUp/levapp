/**
 * B-131 — `debug_schedule_reminder_test` (backend/padel_app/modules/
 * notification_engine_api.py, `debug_schedule_reminder_test`) creates a
 * Lesson + LessonInstance titled "E2E Auto-Reminder Test" at club-now + 48h
 * and hands the caller no way to remove it. Nothing ever did, so on a Tuesday
 * afternoon the leaked classes land on the seed's "next Thursday 16:00" slot
 * (.cortex/compass/bugs/B-131-a-debug-endpoints-test-class-was-never-removed.md).
 *
 * This calls its cleanup counterpart, `POST
 * /api/app/notify/debug/schedule_reminder_test/cleanup`, which deletes every
 * such class belonging to the calling coach (R-040: an E2E spec puts the
 * shared database back). Every spec that calls the creator must call this in
 * an `afterAll`/`afterEach`.
 */
import type { APIRequestContext } from "@playwright/test";
import { API_APP } from "./api";

/** Deletes every leaked "E2E Auto-Reminder Test" class owned by the calling
 * coach. Returns the number of classes removed. Throws (with the status and
 * body) if the cleanup route itself fails. */
export async function cleanupReminderTestClasses(
  request: APIRequestContext,
  coachToken: string
): Promise<number> {
  const res = await request.post(
    `${API_APP}/notify/debug/schedule_reminder_test/cleanup`,
    { headers: { Authorization: `Bearer ${coachToken}` } }
  );
  if (!res.ok()) {
    throw new Error(
      `cleanupReminderTestClasses failed: ${res.status()} ${await res.text()}`
    );
  }
  const { removed, remaining } = (await res.json()) as {
    removed: number;
    remaining: number;
  };
  if (remaining > 0) {
    throw new Error(
      `reminder-test cleanup left ${remaining} class(es) behind`
    );
  }
  return removed;
}
