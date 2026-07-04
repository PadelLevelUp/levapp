import { describe, it, expect } from "vitest";
import { queryKeys } from "./queryKeys";

/**
 * The query-key registry must stay byte-identical to the inline keys the web
 * app historically used — cache invalidation across platforms depends on it.
 * These tests pin the exact shapes.
 */
describe("queryKeys", () => {
  it("dashboard defaults params to an empty object", () => {
    expect(queryKeys.dashboard()).toEqual(["dashboard", {}]);
    expect(queryKeys.dashboard({ from: "2026-07-01", to: "2026-07-07" })).toEqual([
      "dashboard",
      { from: "2026-07-01", to: "2026-07-07" },
    ]);
  });

  it("calendarEvents embeds the range as an object", () => {
    expect(queryKeys.calendarEvents("2026-07-01", "2026-07-07")).toEqual([
      "calendar-events",
      { from: "2026-07-01", to: "2026-07-07" },
    ]);
  });

  it("classInstance flattens model/originalId/date", () => {
    expect(
      queryKeys.classInstance({
        model: "academy_class",
        originalId: "42",
        date: "2026-07-06",
      })
    ).toEqual(["class-instance", "academy_class", "42", "2026-07-06"]);
  });

  it("coachPlayersPaginated defaults to empty params", () => {
    expect(queryKeys.coachPlayersPaginated()).toEqual([
      "coach-players-paginated",
      {},
    ]);
  });

  it("conversations defaults to page 1 / limit 20", () => {
    expect(queryKeys.conversations()).toEqual([
      "conversations",
      { page: 1, limit: 20 },
    ]);
    expect(queryKeys.conversations(3, 50)).toEqual([
      "conversations",
      { page: 3, limit: 50 },
    ]);
  });

  it("id-based keys embed the id", () => {
    expect(queryKeys.playerProfile("p1")).toEqual(["player-profile", "p1"]);
    expect(queryKeys.conversation("c1")).toEqual(["conversation", "c1"]);
    expect(queryKeys.exercise("e1")).toEqual(["exercises", "e1"]);
  });

  it("static keys keep the web app's historical strings", () => {
    expect(queryKeys.unreadCount).toEqual(["messages-unread-count"]);
    expect(queryKeys.coachLevels).toEqual(["coach_levels"]);
    expect(queryKeys.availabilityBlockers).toEqual(["availability-blockers"]);
    expect(queryKeys.exercises).toEqual(["exercises"]);
    expect(queryKeys.exerciseGroups).toEqual(["exercise-groups"]);
  });

  it("exercise detail keys are prefixed by the exercises list key", () => {
    // Invalidating ["exercises"] must also match every detail key.
    expect(queryKeys.exercise("e1")[0]).toBe(queryKeys.exercises[0]);
  });
});
