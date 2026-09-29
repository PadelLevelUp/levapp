import { describe, expect, it } from "vitest";
import type { EvaluationCatalogueEntry, EvaluationCompetencies, EvaluationCompetency } from "@levelup/types";

import { readFileSync } from "fs";
import { join } from "path";

import {
  activeCount,
  CATALOGUE_ORDER,
  categorySections,
  competencyKind,
  legacyScaleLabel,
  managerSections,
  type CategorySection,
  type ManagerRow,
} from "./competency-manager";

// evaluations.competencies rules 2 and 5 (PAD-373): what "Gerir competências" lists,
// in which order, and which of the three kinds each row is. Q31 (Session-B, 2026-09-21):
// the coach's existing categories are a section of their own, FIRST; the rest is the
// canvas's order. Static — nothing moves under the finger when a switch is flipped.

const CATALOGUE: EvaluationCatalogueEntry[] = [
  { key: "technique", group: "general" }, { key: "tactics", group: "general" }, { key: "consistency", group: "general" },
  { key: "forehand", group: "technique" }, { key: "backhand", group: "technique" }, { key: "volley", group: "technique" },
  { key: "bandeja", group: "technique" }, { key: "vibora", group: "technique" }, { key: "smash", group: "technique" },
  { key: "glass_exit", group: "technique" }, { key: "double_glass", group: "technique" }, { key: "serve", group: "technique" },
  { key: "defensive_position", group: "tactics" }, { key: "attacking_position", group: "tactics" },
  { key: "transition", group: "tactics" }, { key: "decision_making", group: "tactics" }, { key: "doubles_play", group: "tactics" },
];

function competency(over: Partial<EvaluationCompetency>): EvaluationCompetency {
  return { id: 1, key: null, name: "x", group: null, scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over };
}

const keyOf = (row: ManagerRow) => (row.kind === "available" ? row.entry.key : row.competency.key);

const FOREHAND_LEGACY = competency({ id: 7, name: "Forehand", group: null, scaleMin: 1, scaleMax: 10, scoreCount: 12 });

describe("competencyKind", () => {
  it("tells the three kinds of row apart", () => {
    expect(competencyKind(competency({ key: "bandeja", group: "technique" }))).toBe("catalogue");
    expect(competencyKind(competency({ key: null, group: "custom" }))).toBe("custom");
    expect(competencyKind(FOREHAND_LEGACY)).toBe("legacy");
  });
});

describe("managerSections", () => {
  it("an existing coach opens onto their own categories, first and switched on, with the untouched catalogue below (Q31)", () => {
    const ana: EvaluationCompetencies = { competencies: [FOREHAND_LEGACY], catalogue: CATALOGUE };

    const sections = managerSections(ana);

    expect(sections.map((s) => [s.group, s.rows.length])).toEqual([["legacy", 1], ["general", 3], ["technique", 9], ["tactics", 5]]);
    const own = sections[0];
    expect(own.rows[0]).toEqual({ kind: "existing", competency: FOREHAND_LEGACY, rowKind: "legacy" });
    expect(own.rows.every((row) => row.kind === "existing" && row.competency.isActive)).toBe(true);
    expect(sections.slice(1).flatMap((s) => s.rows).every((row) => row.kind === "available")).toBe(true);
  });

  it("the order does not move when the coach toggles: a switched-off legacy category stays first", () => {
    const off = { ...FOREHAND_LEGACY, isActive: false };
    const on = competency({ id: 12, key: "bandeja", name: "Bandeja", group: "technique" });

    const sections = managerSections({ competencies: [on, off], catalogue: [] });

    expect(sections.map((s) => s.group)).toEqual(["legacy", "technique"]);
  });

  it("a new coach sees exactly the canvas's order — no section of their own, and no empty Personalizada", () => {
    const general = ["technique", "tactics", "consistency"].map((key, i) =>
      competency({ id: i + 1, key, name: key, group: "general" }));
    const bruno: EvaluationCompetencies = { competencies: general, catalogue: CATALOGUE.slice(3) };

    const sections = managerSections(bruno);

    expect(sections.map((s) => s.group)).toEqual(["general", "technique", "tactics"]);
    expect(sections[0].rows.map((row) => row.kind)).toEqual(["existing", "existing", "existing"]);
  });

  it("lists a catalogue group in the catalogue's fixed order, rows and not-yet-rows interleaved", () => {
    const bandeja = competency({ id: 12, key: "bandeja", name: "Bandeja", group: "technique", isActive: false });
    const data: EvaluationCompetencies = {
      competencies: [bandeja],
      catalogue: CATALOGUE.filter((entry) => entry.key !== "bandeja"),
    };

    const technique = managerSections(data).find((s) => s.group === "technique");

    expect(technique).toBeDefined();
    expect(technique!.rows.map(keyOf)).toEqual(
      ["forehand", "backhand", "volley", "bandeja", "vibora", "smash", "glass_exit", "double_glass", "serve"]);
    expect(technique!.rows[3]).toEqual({ kind: "existing", competency: bandeja, rowKind: "catalogue" });
  });

  it("switching an entry on for the FIRST time does not move it: it becomes a row in the same place", () => {
    const before: EvaluationCompetencies = { competencies: [], catalogue: CATALOGUE };
    // What the API answers after POST {catalogueKey: "smash"}: smash is a row now, and gone from catalogue[].
    const smash = competency({ id: 21, key: "smash", name: "Smash", group: "technique" });
    const after: EvaluationCompetencies = { competencies: [smash], catalogue: CATALOGUE.filter((e) => e.key !== "smash") };

    const orderOf = (data: EvaluationCompetencies) => managerSections(data).find((s) => s.group === "technique")!.rows.map(keyOf);

    expect(orderOf(before).indexOf("smash")).toBe(5);
    expect(orderOf(after)).toEqual(orderOf(before));
    // ...and switching it off again (it stays a row) moves nothing either.
    expect(orderOf({ ...after, competencies: [{ ...smash, isActive: false }] })).toEqual(orderOf(before));
  });

  it("a catalogue key this client does not know sorts after the known ones, in the order the API gave", () => {
    const lob = competency({ id: 30, key: "lob", name: "Lob", group: "technique" });
    const data: EvaluationCompetencies = { competencies: [lob], catalogue: [{ key: "drop_shot", group: "technique" }, { key: "serve", group: "technique" }] };

    expect(managerSections(data)[0].rows.map(keyOf)).toEqual(["serve", "lob", "drop_shot"]);
  });

  it("never re-adds a catalogue entry the API left out (the coach's own 'bandeja' hides its twin)", () => {
    const own = competency({ id: 3, name: "bandeja", group: null, scaleMin: 0, scaleMax: 10 });
    const carla: EvaluationCompetencies = { competencies: [own], catalogue: CATALOGUE.filter((e) => e.key !== "bandeja") };

    const keys = managerSections(carla).flatMap((s) => s.rows).flatMap((row) => (row.kind === "available" ? [row.entry.key] : []));

    expect(keys).toHaveLength(16);
    expect(keys).not.toContain("bandeja");
  });

  it("keeps legacy categories apart from new-style custom competencies — they are a different kind of thing", () => {
    const saque = competency({ id: 13, name: "Saque cruzado", group: "custom" });
    const data: EvaluationCompetencies = { competencies: [saque, FOREHAND_LEGACY], catalogue: [] };

    const sections = managerSections(data);

    expect(sections.map((s) => s.group)).toEqual(["legacy", "custom"]);
    expect(sections.map((s) => s.rows.map((row) => (row.kind === "existing" ? [row.competency.id, row.rowKind] : null)))).toEqual(
      [[[7, "legacy"]], [[13, "custom"]]]);
  });
});

describe("legacyScaleLabel", () => {
  it("writes a legacy category's own scale out and says nothing for a star competency", () => {
    expect(legacyScaleLabel(FOREHAND_LEGACY)).toBe("1–10");
    expect(legacyScaleLabel(competency({ group: null, scaleMin: 0, scaleMax: 10 }))).toBe("0–10");
    expect(legacyScaleLabel(competency({ group: "custom" }))).toBeNull();
    expect(legacyScaleLabel(competency({ key: "volley", group: "technique" }))).toBeNull();
  });
});

describe("activeCount", () => {
  it("counts the rows that are switched on; an available entry is not a row", () => {
    const data: EvaluationCompetencies = {
      competencies: [FOREHAND_LEGACY, competency({ id: 2, group: "custom", isActive: false })],
      catalogue: CATALOGUE,
    };

    expect(activeCount(data)).toBe(1);
    expect(activeCount({ competencies: [], catalogue: CATALOGUE })).toBe(0);
  });
});

describe("CATALOGUE_ORDER", () => {
  it("is the server's catalogue, key for key and in its order (one list, two copies — this is the tie)", () => {
    const python = readFileSync(
      join(__dirname, "..", "..", "..", "..", "backend", "padel_app", "services", "evaluation_catalogue.py"), "utf8");
    const block = python.slice(python.indexOf("CATALOGUE = ("), python.indexOf("BY_KEY"));
    const serverKeys = [...block.matchAll(/^\s+\("([a-z_]+)",/gm)].map((m) => m[1]);

    expect(serverKeys).toHaveLength(17);
    expect([...CATALOGUE_ORDER]).toEqual(serverKeys);
    expect(CATALOGUE.map((entry) => entry.key)).toEqual(serverKeys);
  });
});

// PAD-431 (evaluations.competencies rule 15): the manager as a tree.
describe("categorySections (PAD-431)", () => {
  const shape = (sections: CategorySection[]) =>
    sections.map((s) => [s.id, s.head ? (s.head.kind === "available" ? `+${s.head.entry.key}` : s.head.competency.id) : null, s.subs.map((r) => (r.kind === "available" ? `+${r.entry.key}` : r.competency.id)), s.parentId]);

  const tree = () => {
    let id = 100;
    const cats = ["technique", "tactics", "consistency"].map((key) => competency({ id: ++id, key, name: key, group: "general", parentId: null }));
    const subs = CATALOGUE.slice(3).map((entry) =>
      competency({ id: ++id, key: entry.key, name: entry.key, group: entry.group, parentId: cats[entry.group === "technique" ? 0 : 1].id }));
    return { cats, subs };
  };

  it("a new coach sees the whole default tree, each category with its sub-categories in the catalogue's order", () => {
    const { cats, subs } = tree();
    const sections = categorySections({ competencies: [...cats, ...subs], catalogue: [] });
    expect(sections.map((s) => [s.id, s.subs.length, s.parentId])).toEqual([
      ["key-technique", 9, 101], ["key-tactics", 5, 102], ["key-consistency", 0, 103],
    ]);
    expect(sections[0].subs.map(keyOf)).toEqual(CATALOGUE.slice(3, 12).map((e) => e.key));
  });

  it("an existing coach with legacy categories only: their own first, then every default offered", () => {
    const sections = categorySections({ competencies: [FOREHAND_LEGACY], catalogue: CATALOGUE });
    expect(shape(sections)).toEqual([
      ["legacy", null, [7], null],
      ["key-technique", "+technique", CATALOGUE.slice(3, 12).map((e) => `+${e.key}`), null],
      ["key-tactics", "+tactics", CATALOGUE.slice(12).map((e) => `+${e.key}`), null],
      ["key-consistency", "+consistency", [], null],
    ]);
  });

  it("interleaves held and offered sub-categories in the catalogue's order; the coach's own sub-categories follow", () => {
    const technique = competency({ id: 1, key: "technique", group: "general", parentId: null });
    const smash = competency({ id: 2, key: "smash", group: "technique", parentId: 1 });
    const mine = competency({ id: 3, key: null, name: "Recuperação", group: "custom", parentId: 1 });
    const offered = CATALOGUE.filter((e) => e.group === "technique" && e.key !== "smash");
    const sections = categorySections({ competencies: [technique, smash, mine], catalogue: offered });
    expect(sections[0].subs.map((r) => (r.kind === "available" ? r.entry.key : r.competency.id))).toEqual([
      "forehand", "backhand", "volley", "bandeja", "vibora", 2, "glass_exit", "double_glass", "serve", 3,
    ]);
  });

  it("a coach's own category is a section with its sub-categories, after the defaults", () => {
    const grit = competency({ id: 5, key: null, name: "Grit", group: "custom", parentId: null });
    const recovery = competency({ id: 6, key: null, name: "Recuperação", group: "custom", parentId: 5 });
    const sections = categorySections({ competencies: [grit, recovery], catalogue: [] });
    expect(shape(sections)).toEqual([["id-5", 5, [6], 5]]);
  });

  it("a renamed default keeps its sub-categories; the default comes back offered with what the coach lacks", () => {
    const mine = competency({ id: 1, key: null, name: "Técnica base", group: "custom", parentId: null });
    const vibora = competency({ id: 2, key: "vibora", group: "technique", parentId: 1 });
    const offered = CATALOGUE.filter((e) => e.key === "technique" || (e.group === "technique" && e.key !== "vibora"));
    const sections = categorySections({ competencies: [mine, vibora], catalogue: offered });
    expect(sections.map((s) => [s.id, s.subs.length, s.parentId])).toEqual([["key-technique", 8, null], ["id-1", 1, 1]]);
  });

  it("a default the coach cannot be offered (they hold its name) still lists its sub-categories, under its name", () => {
    const legacyTecnica = competency({ id: 9, key: null, name: "Técnica", group: null });
    const bandejaTop = competency({ id: 10, key: "bandeja", group: "technique", parentId: null });
    const offered = CATALOGUE.filter((e) => e.group === "technique" && e.key !== "bandeja");
    const sections = categorySections({ competencies: [legacyTecnica, bandejaTop], catalogue: offered });
    const technique = sections.find((s) => s.id === "key-technique")!;
    expect([technique.head, technique.headKey, technique.parentId, technique.subs.length]).toEqual([null, "technique", null, 8]);
    // the sub-level row the server left top-level is a category of its own, which cannot hold sub-categories
    expect(shape(sections).find((s) => s[0] === "key-bandeja")).toEqual(["key-bandeja", 10, [], null]);
  });

  it("a row whose category is missing from the list is shown on its own, never lost", () => {
    const stray = competency({ id: 8, key: null, name: "Stray", group: "custom", parentId: 99 });
    // …and, being a sub-category, it cannot hold sub-categories (two levels only)
    expect(shape(categorySections({ competencies: [stray], catalogue: [] }))).toEqual([["id-8", 8, [], null]]);
  });

  it("nothing moves when a switch is flipped", () => {
    const { cats, subs } = tree();
    const before = categorySections({ competencies: [...cats, ...subs], catalogue: [] });
    const flipped = [...cats.map((c, i) => (i === 0 ? { ...c, isActive: false } : c)), ...subs.map((c, i) => (i === 3 ? { ...c, isActive: false } : c))];
    expect(shape(categorySections({ competencies: flipped, catalogue: [] }))).toEqual(shape(before));
  });
});
