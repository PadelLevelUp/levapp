import { describe, expect, it } from "vitest";
import { instanceIdFromParams, paramsToEvent } from "@/features/calendar/params";
import { nativeRouteForWebPath } from "./routes";

/**
 * calendar.event-detail rule 15 / CALENDAR-EVENT-DETAIL-13: a route carrying only an instance id (a
 * push, a link, a message's `lessonInstanceId`) is resolved by `GET /api/app/lesson_instance/<id>`; the
 * full params stay the fast path. `app/class/[id].tsx` takes the id fetch only when `paramsToEvent`
 * is null. A web href with a `classId` and NO date (`/calendar?classId=lessoninstance-1`) used to
 * come out of `nativeRouteForWebPath` with `model` and `originalId` set and an empty date, so
 * `paramsToEvent` built an event with no date and the screen never fetched by id.
 */
function paramsOf(href: string, hint?: { title?: string; timeLabel?: string }) {
  const route = nativeRouteForWebPath(href, hint);
  if (!route || route.pathname !== "/class/[id]") throw new Error(`not a class route: ${JSON.stringify(route)}`);
  return route.params as Record<string, string>;
}

describe("a class href with an instance id and no date opens by id", () => {
  it.each([
    ["no date", "/calendar?classId=lessoninstance-1"],
    ["an empty date", "/calendar?classId=lessoninstance-1&date="],
  ])("[CALENDAR-EVENT-DETAIL-13] %s: the screen resolves it from the id alone", (_name, href) => {
    const params = paramsOf(href);
    expect(paramsToEvent(params)).toBeNull(); // so the screen fetches GET /lesson_instance/1
    expect(instanceIdFromParams(params)).toBe(1);
  });

  it("[CALENDAR-EVENT-DETAIL-13] the same href carrying a date keeps the full-params fast path", () => {
    const params = paramsOf("/calendar?classId=lessoninstance-1&date=2026-07-07", { title: "Aula", timeLabel: "19:30" });
    expect(paramsToEvent(params)).toMatchObject({ originalId: 1, date: "2026-07-07", startTime: "19:30", title: "Aula" });
  });

  it("[CALENDAR-EVENT-DETAIL-13] a projected occurrence (id carries its date) keeps its params", () => {
    const params = paramsOf("/calendar?classId=lesson-3-2026-07-07");
    expect(paramsToEvent(params)).toMatchObject({ originalId: 3, date: "2026-07-07" });
  });
});
