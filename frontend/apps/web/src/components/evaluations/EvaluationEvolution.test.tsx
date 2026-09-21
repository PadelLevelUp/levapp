/**
 * evaluations.evolution (PAD-375). The arithmetic is the server's and is tested in
 * PAD-364; this asserts the RENDERING of a known response — the client computes
 * nothing (R-048), so every number here must be exactly what was sent.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { EvaluationCompetency, EvaluationEvolution as Evolution } from "@levelup/types";

const asked: (number | null)[] = [];
const state = { byCategory: {} as Record<number, Evolution> };

vi.mock("@levelup/hooks", async () => ({
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useHeldWhile")>(
    "../../../../../packages/hooks/src/useHeldWhile"
  )),
  usePlayerEvolution: (_playerId: string, categoryId: number | null) => {
    asked.push(categoryId);
    return { data: categoryId === null ? undefined : state.byCategory[categoryId], isLoading: false, isError: false };
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));

import { EvaluationEvolution } from "./EvaluationEvolution";

beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const competency = (id: number, name: string, over: Partial<EvaluationCompetency> = {}): EvaluationCompetency => ({
  id, key: null, name, group: "custom", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 1, ...over,
});
const BANDEJA = competency(12, "Bandeja", { key: "bandeja", group: "technique", isActive: false });
const TECNICA = competency(3, "Técnica", { key: "technique", group: "general" });
const FOREHAND = competency(30, "Forehand", { group: null, scaleMax: 10 });

const JOAO_BANDEJA: Evolution = {
  scaleMin: 1, scaleMax: 5,
  series: [{ month: "2026-01", mean: 2.5 }, { month: "2026-03", mean: 3.0 }, { month: "2026-06", mean: 3.5 }, { month: "2026-09", mean: 4.0 }],
  means: { m1: 4.0, m6: 3.7, m12: 3.1 },
  delta: { value: 1.5, sinceMonth: "2026-01" },
};

beforeEach(() => {
  asked.length = 0;
  state.byCategory = {
    12: JOAO_BANDEJA,
    3: { scaleMin: 1, scaleMax: 5, series: [{ month: "2026-01", mean: 4 }, { month: "2026-09", mean: 4 }],
         means: { m1: 4, m6: 4, m12: 4 }, delta: { value: 0, sinceMonth: "2026-01" } },
    30: { scaleMin: 1, scaleMax: 10, series: [{ month: "2026-02", mean: 6 }], means: { m1: null, m6: null, m12: 6 }, delta: null },
  };
});

const show = (withData: number[], playerId = "9") =>
  render(<EvaluationEvolution playerId={playerId} competencies={[TECNICA, BANDEJA, FOREHAND]} competenciesWithData={withData} />);

describe("the pills", () => {
  it("are one per competency the player has data for — a switched-off one included — and the FIRST is selected", () => {
    show([12, 3]);
    const pills = screen.getAllByTestId(/^evolution-pill-/);
    expect(pills.map((p) => p.getAttribute("data-testid"))).toEqual(["evolution-pill-12", "evolution-pill-3"]);
    expect(pills[0].getAttribute("aria-pressed")).toBe("true");
    expect(asked[asked.length - 1]).toBe(12); // never a hard-coded competency
  });

  it("switching the pill asks the server for that competency", () => {
    show([12, 3]);
    fireEvent.click(screen.getByTestId("evolution-pill-3"));
    expect(asked[asked.length - 1]).toBe(3);
    expect(screen.getByTestId("evolution-pill-3").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the figures are exactly what the server sent", () => {
  it("shows the three means with one decimal and the delta as up, since the first month", () => {
    show([12]);
    expect(screen.getByTestId("evolution-mean-m1").getAttribute("data-value")).toBe("4.0");
    expect(screen.getByTestId("evolution-mean-m6").getAttribute("data-value")).toBe("3.7");
    expect(screen.getByTestId("evolution-mean-m12").getAttribute("data-value")).toBe("3.1");
    const delta = screen.getByTestId("evolution-delta");
    expect(delta.getAttribute("data-trend")).toBe("up");
    expect(delta.textContent).toContain("+1.5");
    expect(delta.textContent).toContain("jan");
  });

  it("a zero delta reads '=' and is neutral — never '+0'", () => {
    show([3]);
    const delta = screen.getByTestId("evolution-delta");
    expect(delta.getAttribute("data-trend")).toBe("flat");
    expect(delta.textContent).not.toContain("+0");
    expect(delta.textContent).toContain("deltaFlat");
  });

  it("a single monthly point has no delta, and an empty window is a dash, not a zero", () => {
    show([30]);
    expect(screen.queryByTestId("evolution-delta")).toBeNull();
    expect(screen.getByTestId("evolution-mean-m1").getAttribute("data-value")).toBe("—");
    expect(screen.getByTestId("evolution-mean-m12").getAttribute("data-value")).toBe("6.0");
    expect(screen.getByTestId("evolution-chart").getAttribute("data-points")).toBe("1");
  });
});

describe("the chart", () => {
  it("is drawn on the competency's OWN scale and names itself", () => {
    show([30]);
    const chart = screen.getByTestId("evolution-chart");
    expect(chart.getAttribute("data-scale")).toBe("1-10");
    expect(chart.getAttribute("aria-label")).toContain("Forehand");
  });

  it("every value is reachable without hover: a table of the series sits beside the picture", () => {
    show([12]);
    const rows = within(screen.getByTestId("evolution-table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["jan2.5", "mar3.0", "jun3.5", "set4.0"]);
  });
});

describe("no data at all", () => {
  it("is the empty state, with no pill and no request", () => {
    show([]);
    expect(screen.getByTestId("evaluation-evolution-empty")).toBeTruthy();
    expect(screen.queryByTestId(/^evolution-pill-/)).toBeNull();
    expect(asked.every((id) => id === null)).toBe(true);
  });
});

describe("another player", () => {
  it("never inherits the previous player's selection", () => {
    const first = show([12, 3], "9");
    fireEvent.click(screen.getByTestId("evolution-pill-3"));
    first.unmount();
    show([30, 3], "10");
    expect(screen.getByTestId("evolution-pill-30").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("while the evaluation form is open (held)", () => {
  const view = (withData: number[], held: boolean) => (
    <EvaluationEvolution playerId="9" competencies={[TECNICA, BANDEJA, FOREHAND]} competenciesWithData={withData} held={held} />
  );

  it("keeps its pills and its figures, and follows the server again when released", () => {
    const shown = render(view([12], false));
    shown.rerender(view([12], true));
    // the coach's tap was saved: a new competency has data and Bandeja's month moved
    state.byCategory[12] = { ...JOAO_BANDEJA, means: { m1: 4.5, m6: 3.8, m12: 3.2 } };
    shown.rerender(view([12, 3], true));
    expect(screen.queryByTestId("evolution-pill-3")).toBeNull();
    expect(screen.getByTestId("evolution-mean-m1").getAttribute("data-value")).toBe("4.0");
    shown.rerender(view([12, 3], false));
    expect(screen.getByTestId("evolution-pill-3")).toBeTruthy();
    expect(screen.getByTestId("evolution-mean-m1").getAttribute("data-value")).toBe("4.5");
  });

  it("another pill can still be chosen, and shows that competency's own figures", () => {
    const shown = render(view([12, 3], true));
    fireEvent.click(screen.getByTestId("evolution-pill-3"));
    expect(screen.getByTestId("evolution-mean-m12").getAttribute("data-value")).toBe("4.0");
    shown.unmount();
  });
});
