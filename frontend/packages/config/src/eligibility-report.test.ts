import { describe, expect, it } from "vitest";
import { describeImpact, describeIneligible, impactStudentCount } from "./eligibility-report";

const level = { attribute: "level", operation: "same_as_class", actual: "B1", threshold: "I1", ladder_distance: 1, reason: null };
const absences = { attribute: "unjustified_absences", operation: "less_than_or_equal", actual: 4, threshold: 2, ladder_distance: null, reason: null };

// eligibility.enforcement rule 7 / 7d — one line per failed rule, per student
describe("describeIneligible", () => {
  it("keeps one block per student and one reason per failed rule", () => {
    const out = describeIneligible([
      { playerId: 1, name: "Ana", failures: [level, absences] },
      { playerId: 2, name: null, failures: [level] },
    ]);
    expect(out.map((s) => s.name)).toEqual(["Ana", ""]);
    expect(out[0].reasons.map((r) => r.key)).toEqual([
      "tutorials.eligibility.levelBelowOne",
      "tutorials.eligibility.absencesOver",
    ]);
    expect(out[0].reasons[1].params).toMatchObject({ actual: 4, threshold: 2 });
  });
});

// eligibility.enforcement rule 9b — per (student, class), ordered by class
describe("describeImpact", () => {
  const affected = [
    { playerId: 2, name: "Bruno", instanceId: 20, classTitle: "Tue", startDatetime: "2026-09-15T18:00:00", failures: [level] },
    { playerId: 1, name: "Ana", instanceId: 10, classTitle: "Mon", startDatetime: "2026-09-14T18:00:00", failures: [level] },
    { playerId: 1, name: "Ana", instanceId: 20, classTitle: "Tue", startDatetime: "2026-09-15T18:00:00", failures: [absences] },
  ];
  it("orders by class start then name and counts distinct students", () => {
    const lines = describeImpact(affected);
    expect(lines.map((l) => `${l.classTitle}/${l.name}`)).toEqual(["Mon/Ana", "Tue/Ana", "Tue/Bruno"]);
    expect(impactStudentCount(affected)).toBe(2);
  });
  it("is empty for an empty report", () => {
    expect(describeImpact([])).toEqual([]);
    expect(impactStudentCount([])).toBe(0);
  });
});
