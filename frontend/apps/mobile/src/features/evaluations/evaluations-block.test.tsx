/**
 * players.profile rule 10 and evaluations.history rule 2 (PAD-834): the player screen's Avaliações
 * block on iOS — the date line, the entry points into the history screen, the last evaluation and
 * the Evolução gate. The screen's wiring is pinned by reading its source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import type { EvaluationRecord } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o && "date" in o ? `${k}|${o.date}` : k),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("./evolution-section", async () => {
  const { View } = await import("react-native");
  const React = await import("react");
  return { EvolutionSection: () => React.createElement(View, { testID: "evolution-section-stub" }) };
});

import { EvaluationsBlock } from "./evaluations-block";

const text = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const record = (over: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: 1, evaluatedOn: "2026-09-21", classInstanceId: null, className: null, note: null, editable: true,
  ratings: [], share: null, ...over,
});
const TODAY = record({ id: 9, ratings: [{ categoryId: 3, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 }], note: "Bom trabalho" });
const EARLIER = record({ id: 2, evaluatedOn: "2026-06-18", editable: false });

const mount = (records: EvaluationRecord[], lastEvaluatedOn: string | null = records[0]?.evaluatedOn ?? null) => {
  const h = { onOpenHistory: vi.fn(), onNew: vi.fn(), onEdit: vi.fn() };
  const n = renderNative(createElement(EvaluationsBlock, {
    playerId: "9", authorName: "Ana Coach", records, lastEvaluatedOn, competencies: [], competenciesWithData: [3],
    loading: false, ready: true, ...h,
  }));
  return { n, h };
};

describe("EvaluationsBlock on iOS (PAD-834)", () => {
  it("[EVALUATIONS-HISTORY-2] the date line and the entry points on iOS", async () => {
    const some = mount([TODAY, EARLIER]);
    const a = await some.n;
    expect(text(a.byTestId("evaluation-card-last"))).toContain("2026");
    await a.press("player-evaluations-open");
    expect(some.h.onOpenHistory).toHaveBeenCalled();

    const none = mount([], null);
    const b = await none.n;
    expect(text(b.byTestId("evaluation-card-last"))).toBe("players.evaluationHistory.none");
    expect(b.queryByTestId("player-evaluations-open")).not.toBeNull(); // "Histórico (0)" keeps the entry id
    await b.press("profile-evaluations-first");
    expect(none.h.onNew).toHaveBeenCalledTimes(1);
    expect(b.queryByTestId("profile-evaluation-last")).toBeNull();
  });

  it("[PLAYERS-PROFILE-16] the same on iOS", async () => {
    const { n, h } = mount([TODAY, EARLIER]);
    const r = await n;
    expect(r.byTestId("profile-evaluation-last-author").props.accessibilityHint).toBe("Ana Coach");
    expect(r.queryByTestId("evaluation-stars-3-4")).not.toBeNull(); // read-only: 4 of 5
    expect(text(r.byTestId("profile-evaluation-last-note"))).toContain("Bom trabalho");
    await r.press("profile-evaluation-last-edit");
    expect(h.onEdit).toHaveBeenCalledWith(TODAY);
    await r.press("profile-evaluations-new");
    expect(h.onNew).toHaveBeenCalledTimes(1);

    const old = await mount([EARLIER]).n;
    expect(old.queryByTestId("profile-evaluation-last-edit")).toBeNull();
  });

  it("[PLAYERS-PROFILE-17] zero, one and two records on iOS", async () => {
    const zero = await mount([], null).n;
    expect(zero.queryByTestId("profile-evaluations-first")).not.toBeNull();
    expect(zero.queryByTestId("profile-evolution-gate")).toBeNull();
    const one = await mount([TODAY]).n;
    expect(one.queryByTestId("profile-evolution-gate")).not.toBeNull();
    expect(one.queryByTestId("evaluation-evolution")).toBeNull();
    const two = await mount([TODAY, EARLIER]).n;
    expect(two.queryByTestId("profile-evolution-gate")).toBeNull();
    expect(two.queryByTestId("evaluation-evolution")).not.toBeNull();
  });

  it("is what the player screen renders, and the history screen opens on the form and has no Evolução", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
    expect(screen).toContain("<EvaluationsBlock");
    expect(screen).toContain('onNew={() => openEvaluations("new")}');
    const history = fs.readFileSync(path.resolve(here, "player-evaluations-screen.tsx"), "utf8");
    expect(history).not.toContain("<EvolutionSection");
    expect(history).toContain("initialForm");
  });
});
