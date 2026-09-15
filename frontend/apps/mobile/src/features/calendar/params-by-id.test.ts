import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eventFromLessonInstance, instanceIdFromParams, paramsToEvent } from "./params";

/**
 * PAD-326 (`calendar.event-detail` rule 15): an instance id is enough to open a
 * class.
 *
 * The screen used to need `id` AND `model` AND `originalId`, so a route
 * carrying only an id — a push, a universal link from an email, the
 * `lessonInstanceId` every message already has — rendered "could not find this
 * class" WITHOUT ever asking the server. That is the screen a founder
 * photographed. These two pure functions are the way out: one says whether
 * there is an id worth asking about, the other turns the answer into the event
 * the screen renders.
 */

const PAYLOAD = {
  id: 42,
  lessonId: 7,
  date: "2026-09-20",
  startTime: "10:00",
  endTime: "11:00",
  status: "scheduled",
  name: "Segunda 10h",
  color: "#123456",
  maxPlayers: 4,
};

describe("instanceIdFromParams — is there something to ask about?", () => {
  it("finds a numeric id", () => {
    expect(instanceIdFromParams({ id: "42" })).toBe(42);
    expect(instanceIdFromParams({ id: ["42"] })).toBe(42);
  });

  it("accepts the calendar-event id shape a message or a link may carry", () => {
    expect(instanceIdFromParams({ id: "lessoninstance-42" })).toBe(42);
  });

  it("returns null for an id that names no instance", () => {
    // A projected occurrence is `lesson-<id>-<date>`: it has no instance row to
    // fetch, so asking by id is meaningless and the screen must not try.
    expect(instanceIdFromParams({ id: "lesson-7-2026-09-20" })).toBeNull();
    expect(instanceIdFromParams({ id: "" })).toBeNull();
    expect(instanceIdFromParams({ id: "abc" })).toBeNull();
    expect(instanceIdFromParams({})).toBeNull();
  });
});

describe("eventFromLessonInstance — the fetched class becomes the event", () => {
  it("builds an event the screen can render", () => {
    expect(eventFromLessonInstance(PAYLOAD)).toMatchObject({
      id: "lessoninstance-42",
      model: "LessonInstance",
      originalId: 42,
      type: "class",
      date: "2026-09-20",
      startTime: "10:00",
      endTime: "11:00",
      title: "Segunda 10h",
      color: "#123456",
      maxPlayers: 4,
      status: "scheduled",
    });
  });

  it("produces exactly what the params path produces, so the screen cannot tell them apart", () => {
    // The invariant that matters: an id-resolved event and a params-built event
    // must be the same shape, or the screen behaves differently depending on how
    // it was opened — which is the class of bug this ticket exists to end.
    const fromParams = paramsToEvent({
      id: "lessoninstance-42",
      model: "LessonInstance",
      originalId: "42",
      date: "2026-09-20",
      startTime: "10:00",
      endTime: "11:00",
      title: "Segunda 10h",
      color: "#123456",
      maxPlayers: "4",
      status: "scheduled",
    });
    const fromId = eventFromLessonInstance(PAYLOAD);
    expect(fromId.id).toBe(fromParams?.id);
    expect(fromId.model).toBe(fromParams?.model);
    expect(fromId.originalId).toBe(fromParams?.originalId);
    expect(fromId.date).toBe(fromParams?.date);
    expect(fromId.startTime).toBe(fromParams?.startTime);
  });

  it("survives a payload missing the optional dressing", () => {
    const bare = eventFromLessonInstance({ id: 42, date: "2026-09-20", startTime: "10:00" });
    expect(bare.originalId).toBe(42);
    expect(bare.title).toBeUndefined();
    expect(bare.color).toBeUndefined();
  });
});

describe("the screen asks, and then says which kind of failure it was", () => {
  const SCREEN = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../app/class/[id].tsx"
  );
  const src = () => fs.readFileSync(SCREEN, "utf8");

  it("resolves from the id when the params do not carry an event", () => {
    expect(src()).toMatch(/instanceIdFromParams\(/);
    expect(src()).toMatch(/useLessonInstanceById\(/);
    expect(src()).toMatch(/eventFromLessonInstance\(/);
  });

  it("keeps the params path free of a round trip", () => {
    // `fallbackId` is null whenever the params already built an event, which is
    // what disables the query — an in-app tap must not gain a fetch.
    expect(src()).toMatch(/paramsEvent \? null : instanceIdFromParams\(params\)/);
  });

  it("separates gone from broken, and never offers a Retry for gone", () => {
    expect(src()).toMatch(/status === 404 \|\| status === 403/);
    expect(src()).toMatch(/classDetail\.classGone/);
    // The retryable branch keeps its Retry; the terminal one must not have one.
    // Slice to the ternary's else, or the window swallows the branch that is
    // SUPPOSED to retry and the assertion means nothing.
    const body = src();
    const start = body.indexOf("gone ? (");
    const terminal = body.slice(start, body.indexOf(") : (", start));
    expect(terminal).toMatch(/classGone/);
    expect(terminal).not.toMatch(/onRetry/);
    expect(body.slice(body.indexOf(") : (", start))).toMatch(/onRetry/);
  });

  it("still says 'could not find' only when there was nothing to ask about", () => {
    expect(src()).toMatch(/classDetail\.notFound/);
  });
});
