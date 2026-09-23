import { describe, expect, it } from "vitest";
import { canPreview, initialShareSelection, shareInput, toggleCategory } from "./evaluation-share";

// evaluations.sharing (PAD-402). One rule per test, cited by number.

const record = {
  ratings: [
    { categoryId: 3, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 },
    { categoryId: 1, name: "Tática", key: "tactics", score: 3, scaleMin: 1, scaleMax: 5 },
    { categoryId: 7, name: "Consistência", key: null, score: 5, scaleMin: 1, scaleMax: 5 },
  ],
};

describe("initialShareSelection (rule 2: Step 1's defaults)", () => {
  it("pre-selects every competency rated in the record, in the record's own order", () => {
    expect(initialShareSelection(record).categoryIds).toEqual([3, 1, 7]);
  });

  it("defaults evolution to 'last' (\"Desde a última avaliação\")", () => {
    expect(initialShareSelection(record).evolution).toBe("last");
  });

  it("starts the include-note toggle OFF — never pre-ticked, even when the record has a note", () => {
    expect(initialShareSelection(record).includeNote).toBe(false);
  });

  it("pre-selects nothing for a record with no ratings", () => {
    expect(initialShareSelection({ ratings: [] }).categoryIds).toEqual([]);
  });
});

describe("toggleCategory (rule 4: order is the coach's, never the order of ticking)", () => {
  it("adds an unticked competency", () => {
    const selection = { categoryIds: [3], evolution: "last" as const, includeNote: false };
    expect(toggleCategory(selection, 1).categoryIds).toEqual([3, 1]);
  });

  it("removes a ticked competency", () => {
    const selection = { categoryIds: [3, 1, 7], evolution: "last" as const, includeNote: false };
    expect(toggleCategory(selection, 1).categoryIds).toEqual([3, 7]);
  });

  it("re-ticking a competency does not move it back to the end — it returns to place", () => {
    // Untick Tática (1), then re-tick it: the checklist (rendered from record.ratings'
    // order, not this array's) still shows Técnica, Tática, Consistência — because
    // nothing downstream reads this array's own order (see the function's comment).
    const start = initialShareSelection(record); // [3, 1, 7]
    const unticked = toggleCategory(start, 1); // [3, 7]
    const reticked = toggleCategory(unticked, 1); // [3, 7, 1] — order-irrelevant
    const rendered = record.ratings.filter((r) => reticked.categoryIds.includes(r.categoryId)).map((r) => r.categoryId);
    expect(rendered).toEqual([3, 1, 7]);
  });

  it("leaves the other fields untouched", () => {
    const selection = { categoryIds: [3], evolution: "6m" as const, includeNote: true };
    const toggled = toggleCategory(selection, 1);
    expect(toggled.evolution).toBe("6m");
    expect(toggled.includeNote).toBe(true);
  });
});

describe("canPreview (rule 6: at least one competency)", () => {
  it("is false with every box clear", () => {
    expect(canPreview({ categoryIds: [], evolution: "last", includeNote: false })).toBe(false);
  });

  it("is true with one or more boxes ticked", () => {
    expect(canPreview({ categoryIds: [3], evolution: "last", includeNote: false })).toBe(true);
  });
});

describe("shareInput (rule 11: every key required, never omitted)", () => {
  it("carries categoryIds, evolution and includeNote exactly as selected", () => {
    const selection = { categoryIds: [3, 1], evolution: "6m" as const, includeNote: true };
    expect(shareInput(selection)).toEqual({ categoryIds: [3, 1], evolution: "6m", includeNote: true });
  });

  it("still sends an empty categoryIds explicitly — the server, not the client, is what refuses it (rule 6)", () => {
    const selection = { categoryIds: [], evolution: "none" as const, includeNote: false };
    expect(shareInput(selection)).toEqual({ categoryIds: [], evolution: "none", includeNote: false });
  });
});
