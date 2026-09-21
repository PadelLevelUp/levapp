import { describe, expect, it } from "vitest";
import {
  EVOLUTION_LINE_COLOR,
  chartPoints,
  defaultEvolutionCompetency,
  deltaPresentation,
  evolutionMonthLabels,
  formatMean,
} from "./evaluation-evolution";

// evaluations.evolution (PAD-375). The server computes every figure (R-048); these
// helpers only PRESENT a known response — labels, signs, pixel positions.

describe("which competency opens selected", () => {
  it("is the first one the player has data for — never a hard-coded one — and none when there is no data", () => {
    expect(defaultEvolutionCompetency([12, 3])).toBe(12);
    expect(defaultEvolutionCompetency([])).toBeNull();
  });

  it("keeps a selection that still has data and drops one that does not (another player)", () => {
    expect(defaultEvolutionCompetency([12, 3], 3)).toBe(3);
    expect(defaultEvolutionCompetency([12, 3], 99)).toBe(12);
  });
});

describe("month labels", () => {
  const series = (months: string[]) => months.map((month) => ({ month, mean: 3 }));

  it("are the short month in the active locale while the series stays inside one year", () => {
    expect(evolutionMonthLabels(series(["2026-01", "2026-06", "2026-09"]), "pt")).toEqual(["jan", "jun", "set"]);
    expect(evolutionMonthLabels(series(["2026-01", "2026-09"]), "en")).toEqual(["Jan", "Sep"]);
  });

  it("carry the year once the series spans more than one", () => {
    expect(evolutionMonthLabels(series(["2025-11", "2026-01", "2026-09"]), "pt")).toEqual(["nov 25", "jan 26", "set 26"]);
  });
});

describe("the delta line", () => {
  it("is up only when positive; down and zero are neutral; zero prints '=' and never '+0'", () => {
    expect(deltaPresentation({ value: 1.5, sinceMonth: "2026-01" })).toEqual({ trend: "up", text: "+1.5", sinceMonth: "2026-01" });
    expect(deltaPresentation({ value: -0.5, sinceMonth: "2026-01" })).toEqual({ trend: "down", text: "-0.5", sinceMonth: "2026-01" });
    expect(deltaPresentation({ value: 0, sinceMonth: "2026-01" })).toEqual({ trend: "flat", text: "=", sinceMonth: "2026-01" });
    expect(deltaPresentation(null)).toBeNull();
  });
});

describe("a mean", () => {
  it("is shown with the one decimal the server sent, and a dash when there is none", () => {
    expect(formatMean(4)).toBe("4.0");
    expect(formatMean(3.7)).toBe("3.7");
    expect(formatMean(null)).toBe("—");
  });
});

describe("the chart's geometry (iOS draws its own polyline)", () => {
  it("spreads the points across the width and maps the scale's ends to the plot's top and bottom", () => {
    const points = chartPoints(
      [{ month: "2026-01", mean: 1 }, { month: "2026-06", mean: 3 }, { month: "2026-09", mean: 5 }],
      { scaleMin: 1, scaleMax: 5, width: 300, height: 140, paddingX: 20, paddingTop: 10, paddingBottom: 30 }
    );
    expect(points).toEqual([{ x: 20, y: 110 }, { x: 150, y: 60 }, { x: 280, y: 10 }]);
  });

  it("centres a single point: one dot, no line", () => {
    expect(chartPoints([{ month: "2026-02", mean: 6 }],
      { scaleMin: 1, scaleMax: 10, width: 300, height: 140, paddingX: 20, paddingTop: 10, paddingBottom: 30 })[0].x).toBe(150);
  });
});

describe("the line colour", () => {
  it("is a selected step per mode, not one colour flipped (validated with the dataviz script)", () => {
    expect(EVOLUTION_LINE_COLOR).toEqual({ light: "#1355DC", dark: "#3B82F6" });
  });
});
