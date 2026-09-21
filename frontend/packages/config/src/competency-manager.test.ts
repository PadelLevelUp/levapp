import { describe, expect, it } from "vitest";
import type { EvaluationCatalogueEntry, EvaluationCompetencies, EvaluationCompetency } from "@levelup/types";

import { activeCount, competencyKind, legacyScaleLabel, managerSections } from "./competency-manager";

// evaluations.competencies rules 2 and 5 (PAD-373): what "Gerir competências" lists,
// in which order, and which of the three kinds each row is.

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

const FOREHAND_LEGACY = competency({ id: 7, name: "Forehand", group: null, scaleMin: 1, scaleMax: 10, scoreCount: 12 });

describe("competencyKind", () => {
  it("tells the three kinds of row apart", () => {
    expect(competencyKind(competency({ key: "bandeja", group: "technique" }))).toBe("catalogue");
    expect(competencyKind(competency({ key: null, group: "custom" }))).toBe("custom");
    expect(competencyKind(FOREHAND_LEGACY)).toBe("legacy");
  });
});

describe("managerSections", () => {
  it("a coach who already has categories sees them under Personalizada and the whole catalogue switched off", () => {
    const ana: EvaluationCompetencies = { competencies: [FOREHAND_LEGACY], catalogue: CATALOGUE };

    const sections = managerSections(ana);

    expect(sections.map((s) => [s.group, s.rows.length])).toEqual([["general", 3], ["technique", 9], ["tactics", 5], ["custom", 1]]);
    const custom = sections.find((s) => s.group === "custom");
    expect(custom, "the legacy row must be found before anything is asserted about it").toBeDefined();
    expect(custom!.rows[0]).toEqual({ kind: "existing", competency: FOREHAND_LEGACY, rowKind: "legacy" });
    expect(sections[0].rows.every((row) => row.kind === "available")).toBe(true);
  });

  it("a coach who started from nothing has no Personalizada section — an empty group is hidden", () => {
    const general = ["technique", "tactics", "consistency"].map((key, i) =>
      competency({ id: i + 1, key, name: key, group: "general" }));
    const bruno: EvaluationCompetencies = { competencies: general, catalogue: CATALOGUE.slice(3) };

    const sections = managerSections(bruno);

    expect(sections.map((s) => s.group)).toEqual(["general", "technique", "tactics"]);
    expect(sections[0].rows.map((row) => row.kind)).toEqual(["existing", "existing", "existing"]);
  });

  it("lists switched-on rows before the entries still available, each in the order the API gave", () => {
    const bandeja = competency({ id: 12, key: "bandeja", name: "Bandeja", group: "technique", isActive: false });
    const data: EvaluationCompetencies = {
      competencies: [bandeja],
      catalogue: CATALOGUE.filter((entry) => entry.key !== "bandeja"),
    };

    const technique = managerSections(data).find((s) => s.group === "technique");

    expect(technique).toBeDefined();
    expect(technique!.rows[0]).toEqual({ kind: "existing", competency: bandeja, rowKind: "catalogue" });
    expect(technique!.rows.slice(1).map((row) => (row.kind === "available" ? row.entry.key : "?"))).toEqual(
      ["forehand", "backhand", "volley", "vibora", "smash", "glass_exit", "double_glass", "serve"]);
  });

  it("never re-adds a catalogue entry the API left out (the coach's own 'bandeja' hides its twin)", () => {
    const own = competency({ id: 3, name: "bandeja", group: null, scaleMin: 0, scaleMax: 10 });
    const carla: EvaluationCompetencies = { competencies: [own], catalogue: CATALOGUE.filter((e) => e.key !== "bandeja") };

    const keys = managerSections(carla).flatMap((s) => s.rows).flatMap((row) => (row.kind === "available" ? [row.entry.key] : []));

    expect(keys).toHaveLength(16);
    expect(keys).not.toContain("bandeja");
  });

  it("puts custom and legacy rows together, in the API's order", () => {
    const saque = competency({ id: 13, name: "Saque cruzado", group: "custom" });
    const data: EvaluationCompetencies = { competencies: [FOREHAND_LEGACY, saque], catalogue: [] };

    const sections = managerSections(data);

    expect(sections.map((s) => s.group)).toEqual(["custom"]);
    expect(sections[0].rows.map((row) => (row.kind === "existing" ? [row.competency.id, row.rowKind] : null))).toEqual(
      [[7, "legacy"], [13, "custom"]]);
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
