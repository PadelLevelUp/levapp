import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluationCompetency, EvaluationRecord } from "@levelup/types";
import {
  createDebouncedWriter,
  formCompetencies,
  formGroups,
  isStarCompetency,
  nextStarScore,
  stepScore,
  todaysClasslessRecord,
  isStarScale,
  ratingInputKind,
  rowOnItsOwnScale,
} from "./evaluation-form";

// evaluations.history rules 4-5, evaluations.records rules 7 and 10 (PAD-374).

const competency = (over: Partial<EvaluationCompetency>): EvaluationCompetency => ({
  id: 1, key: null, name: "X", group: "custom", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0,
  ...over,
});

const record = (over: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: 1, evaluatedOn: "2026-09-21", classInstanceId: null, className: null, note: null, editable: true, ratings: [],
  share: null, ...over,
});

describe("stars or a stepper", () => {
  it("draws stars for every 1-5 scale, a converted legacy category included (PAD-403)", () => {
    expect(isStarCompetency(competency({ group: "technique", key: "bandeja" }))).toBe(true);
    expect(isStarCompetency(competency({ group: "custom" }))).toBe(true);
    // evaluations.legacy-conversion rule 5: legacy categories are 1-5 after the conversion, so stars
    expect(isStarCompetency(competency({ group: null, scaleMin: 1, scaleMax: 5 }))).toBe(true);
    expect(isStarScale({ scaleMin: 1, scaleMax: 5 })).toBe(true);
  });

  it("keeps the number for a scale that is not 1-5, which the server no longer holds", () => {
    // dormant: a row the migration has not reached yet must never draw an 8 as stars
    expect(isStarCompetency(competency({ group: null, scaleMin: 1, scaleMax: 10 }))).toBe(false);
    expect(isStarCompetency(competency({ group: null, scaleMin: 0, scaleMax: 10 }))).toBe(false);
    expect(isStarScale({ scaleMin: 0, scaleMax: 5 })).toBe(false);
  });
});

describe("which input a competency gets (evaluations.scale rule 7, PAD-423)", () => {
  it("stars on 1-5, catalogue, custom and legacy alike", () => {
    expect(ratingInputKind(competency({ group: "technique", key: "bandeja" }))).toBe("stars");
    expect(ratingInputKind(competency({ group: "custom" }))).toBe("stars");
    expect(ratingInputKind(competency({ group: null }))).toBe("stars");
  });

  it("a slider on the coach's 1-10, 1-20 and 1-100", () => {
    for (const scaleMax of [10, 20, 100]) {
      expect(ratingInputKind(competency({ group: "technique", key: "bandeja", scaleMax }))).toBe("slider");
      expect(ratingInputKind(competency({ group: "custom", scaleMax }))).toBe("slider");
    }
  });

  it("the dormant stepper only for a legacy category that is not 1-5", () => {
    expect(ratingInputKind(competency({ group: null, scaleMin: 1, scaleMax: 10 }))).toBe("stepper");
    expect(ratingInputKind(competency({ group: null, scaleMin: 0, scaleMax: 10 }))).toBe("stepper");
  });
});

describe("a row the record already rates keeps that rating's scale (D149)", () => {
  const garra = competency({ id: 4, group: "custom", scaleMin: 1, scaleMax: 10 }); // the coach moved to 1-10
  const rated = record({ ratings: [{ categoryId: 4, name: "Garra", key: null, score: 4, scaleMin: 1, scaleMax: 5 }] });

  it("draws an earlier 4/5 on its own 1-5 (stars), never as 4 on the new 1-10", () => {
    const row = rowOnItsOwnScale(garra, rated);
    expect([row.scaleMin, row.scaleMax]).toEqual([1, 5]);
    expect(ratingInputKind(row)).toBe("stars");
  });

  it("a competency the record does not rate yet uses its current scale", () => {
    expect(rowOnItsOwnScale(garra, record({ ratings: [] }))).toBe(garra);
    expect(rowOnItsOwnScale(garra, null)).toBe(garra);
    expect(ratingInputKind(rowOnItsOwnScale(garra, null))).toBe("slider");
  });
});

describe("what the form lists", () => {
  const active = competency({ id: 1, name: "Técnica" });
  const off = competency({ id: 2, name: "Bandeja", isActive: false });
  const offRatedToday = competency({ id: 3, name: "Smash", isActive: false });

  it("lists active competencies plus a switched-off one already rated in today's record, in the server's order", () => {
    const today = record({ ratings: [{ categoryId: 3, name: "Smash", key: null, score: 4, scaleMin: 1, scaleMax: 5 }] });
    expect(formCompetencies([offRatedToday, active, off], today).map((c) => c.id)).toEqual([3, 1]);
  });

  it("lists only the active ones when there is no record yet", () => {
    expect(formCompetencies([offRatedToday, active, off], null).map((c) => c.id)).toEqual([1]);
  });
});

describe("today's class-less record", () => {
  it("is the editable record with no class — the server says which day is today", () => {
    const records = [
      record({ id: 9, classInstanceId: 88, className: "Aula 5" }),
      record({ id: 8 }),
      record({ id: 3, editable: false, evaluatedOn: "2026-06-18" }),
    ];
    expect(todaysClasslessRecord(records)?.id).toBe(8);
    expect(todaysClasslessRecord([records[0], records[2]])).toBeNull();
  });
});

describe("a star tap", () => {
  it("rates, re-rates, and clears when the lit star is tapped", () => {
    expect(nextStarScore(null, 4)).toBe(4);
    expect(nextStarScore(4, 2)).toBe(2);
    expect(nextStarScore(4, 4)).toBeNull();
  });
});

describe("a stepper press", () => {
  it("starts an unrated category at the middle of its scale, then steps within it", () => {
    expect(stepScore(null, 1, 1, 10)).toBe(6);
    expect(stepScore(null, -1, 0, 10)).toBe(5);
    expect(stepScore(6, 1, 1, 10)).toBe(7);
    expect(stepScore(10, 1, 1, 10)).toBe(10);
    expect(stepScore(0, -1, 0, 10)).toBe(0);
  });
});

describe("the debounced writer (a stepper's consecutive steps are one input)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes once, the last value, after the quiet period", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter(write, 400);
    writer.schedule("7", 6);
    writer.schedule("7", 7);
    writer.schedule("7", 8);
    vi.advanceTimersByTime(399);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write.mock.calls).toEqual([["7", 8]]);
  });

  it("debounces per competency: stepping A then B inside the window writes both", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter(write, 400);
    writer.schedule("7", 6);
    vi.advanceTimersByTime(200);
    writer.schedule("9", 3);
    vi.advanceTimersByTime(400);
    expect(write.mock.calls).toEqual([["7", 6], ["9", 3]]);
  });

  it("flush writes everything pending at once — blur, 'Concluir avaliação', close and unmount call it", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter(write, 400);
    writer.schedule("7", 8);
    writer.schedule("note", "");
    writer.flush();
    expect(write.mock.calls).toEqual([["7", 8], ["note", ""]]);
    vi.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(2); // nothing fires twice
    expect(writer.pending()).toBe(false);
  });

  it("flush of one key leaves the others pending", () => {
    const write = vi.fn();
    const writer = createDebouncedWriter(write, 400);
    writer.schedule("7", 8);
    writer.schedule("9", 3);
    writer.flush("7");
    expect(write.mock.calls).toEqual([["7", 8]]);
    expect(writer.pending()).toBe(true);
  });
});

// PAD-431 (evaluations.competencies rules 15-16): the tree on the form.
describe("formCompetencies over categories and sub-categories (PAD-431)", () => {
  const technique = competency({ id: 10, key: "technique", group: "general", parentId: null });
  const vibora = competency({ id: 11, key: "vibora", group: "technique", parentId: 10 });
  const smashOff = competency({ id: 12, key: "smash", group: "technique", parentId: 10, isActive: false });
  const consistency = competency({ id: 20, key: "consistency", group: "general", parentId: null });

  it("offers the sub-categories, not a category that has an active one", () => {
    expect(formCompetencies([technique, vibora, smashOff, consistency], null).map((c) => c.id)).toEqual([11, 20]);
  });

  it("toggles with its sub-categories: all off → the category is offered; one back on → hidden again", () => {
    const viboraOff = { ...vibora, isActive: false };
    expect(formCompetencies([technique, viboraOff, smashOff], null).map((c) => c.id)).toEqual([10]);
    const smashOn = { ...smashOff, isActive: true };
    expect(formCompetencies([technique, viboraOff, smashOn], null).map((c) => c.id)).toEqual([12]);
  });

  it("offers a category directly once none of its sub-categories is active", () => {
    const viboraOff = { ...vibora, isActive: false };
    expect(formCompetencies([technique, viboraOff, smashOff], null).map((c) => c.id)).toEqual([10]);
  });

  it("offers an active sub-category even when its category is switched off", () => {
    // A coach who had Técnica off and Smash on before PAD-431 keeps Smash on the form.
    const techniqueOff = { ...technique, isActive: false };
    expect(formCompetencies([techniqueOff, vibora, consistency], null).map((c) => c.id)).toEqual([11, 20]);
  });

  it("keeps whatever the record being edited already rates — a history score included", () => {
    const today = record({ ratings: [{ categoryId: 10, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 }] });
    expect(formCompetencies([technique, vibora, consistency], today).map((c) => c.id)).toEqual([10, 11, 20]);
  });
});

// PAD-431 (evaluations.competencies rule 15, D7): the entry form groups sub-categories under
// their category, each group where its category sits in the server's order.
describe("formGroups (PAD-431)", () => {
  const technique = competency({ id: 10, key: "technique", group: "general", parentId: null });
  const tactics = competency({ id: 11, key: "tactics", group: "general", parentId: null });
  const consistency = competency({ id: 12, key: "consistency", group: "general", parentId: null });
  const vibora = competency({ id: 20, key: "vibora", group: "technique", parentId: 10 });
  const smash = competency({ id: 21, key: "smash", group: "technique", parentId: 10 });
  const transition = competency({ id: 30, key: "transition", group: "tactics", parentId: 11 });
  const legacy = competency({ id: 40, key: null, name: "Forehand", group: null, parentId: null });
  const all = [technique, tactics, consistency, vibora, smash, transition, legacy];

  const shape = (groups: ReturnType<typeof formGroups>) => groups.map((g) => [g.category?.id ?? null, g.rows.map((r) => r.id)]);

  it("puts each sub-category under its category, in the categories' order; direct rows stand alone", () => {
    const rows = formCompetencies(all, null); // vibora, smash, transition, consistency, legacy — server order
    expect(shape(formGroups(rows, all))).toEqual([[10, [20, 21]], [11, [30]], [null, [12, 40]]]);
  });

  it("a category scored directly, because its sub-categories are off, is a plain row", () => {
    const offs = all.map((c) => (c.parentId === 11 ? { ...c, isActive: false } : c));
    const rows = formCompetencies(offs, null);
    expect(shape(formGroups(rows, offs))).toEqual([[10, [20, 21]], [null, [11, 12, 40]]]);
  });
});
