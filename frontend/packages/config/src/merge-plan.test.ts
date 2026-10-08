import { describe, expect, it } from "vitest";
import { bucketEntries, describeMergePlan, joinSpoken, summarizeMergePlan } from "./merge-plan";

/** players.claim rule 5j (PAD-528): the spec's own example, bucketed. */
const PLAN = {
  moves: { presences: 2, player_in_lesson: 1, player_in_club: 1, evaluation_records: 1, evaluation_entries: 1, coach_player_notes: 1, player_claim_requests: 1 },
  dropped: { presences: 1, player_in_lesson: 1 },
  merged: { coach_in_player: 1 },
};

describe("summarizeMergePlan", () => {
  it("buckets the spec example: 2 attendances, 1 evaluation, 1 note, 1 class move; 1 attendance and 1 class kept", () => {
    const { moved, kept } = summarizeMergePlan(PLAN);
    expect(bucketEntries(moved)).toEqual([
      { bucket: "attendances", count: 2 },
      { bucket: "evaluations", count: 1 },
      { bucket: "notes", count: 1 },
      { bucket: "classes", count: 1 },
    ]);
    expect(bucketEntries(kept)).toEqual([
      { bucket: "attendances", count: 1 },
      { bucket: "classes", count: 1 },
    ]);
  });

  it("counts a merged evaluation record or thread as moved, never as kept", () => {
    const { moved, kept } = summarizeMergePlan({ moves: {}, dropped: {}, merged: { evaluation_records: 2, conversations: 1 } });
    expect(moved).toEqual({ evaluations: 2, messages: 1 });
    expect(kept).toEqual({});
  });

  it("never shows bookkeeping tables and puts an unknown table under other", () => {
    const { moved } = summarizeMergePlan({ moves: { player_level_history: 3, notification_events: 2, brand_new_table: 1 }, dropped: {}, merged: {} });
    expect(moved).toEqual({ other: 1 });
  });

  it("handles an empty or missing plan", () => {
    expect(summarizeMergePlan(null)).toEqual({ moved: {}, kept: {} });
    expect(bucketEntries({})).toEqual([]);
  });
});

describe("joinSpoken", () => {
  it("joins with commas and the translated conjunction", () => {
    expect(joinSpoken(["a"], "and")).toBe("a");
    expect(joinSpoken(["a", "b"], "e")).toBe("a e b");
    expect(joinSpoken(["a", "b", "c"], "and")).toBe("a, b and c");
  });
});

describe("describeMergePlan", () => {
  const t = (key: string, o?: Record<string, unknown>) =>
    key === "players.claim.and" ? "and"
    : key.startsWith("players.claim.bucket.") ? `${o?.count} ${key.split(".").pop()}`
    : `${key}:${o?.items}`;

  it("phrases the spec example for the student", () => {
    expect(describeMergePlan(PLAN, t, "yours")).toEqual({
      moves: "players.claim.previewMovesYours:2 attendances, 1 evaluations, 1 notes and 1 classes",
      kept: "players.claim.previewKeptYours:1 attendances and 1 classes",
    });
  });

  it("says nothing about kept when nothing collided, and uses the coach's wording", () => {
    expect(describeMergePlan({ moves: { presences: 1 }, dropped: {}, merged: {} }, t, "theirs")).toEqual({
      moves: "players.claim.previewMovesTheirs:1 attendances",
      kept: null,
    });
    expect(describeMergePlan(null, t, "yours")).toEqual({ moves: null, kept: null });
  });
});
