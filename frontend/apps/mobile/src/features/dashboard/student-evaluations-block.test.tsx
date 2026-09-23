/**
 * PAD-402 (`evaluations.student-view` rules 4-5). Covers what the ticket asks
 * for: the block caps at 3 cards (a defensive mirror of the server's own cap)
 * and "Ver todas" pushes `/evaluations` through the shared `routes.ts` mapping
 * — the same `go()` every other dashboard block uses, proven with a real
 * (unmocked) `nativeRouteForWebPath`. `expo-router`'s `router` is a spy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { DashboardEvaluationsBlock, EvaluationCard } from "@levelup/types";
import { renderNative } from "@/test/render-native";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: nav.push } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// `./blocks` (for `go()`) pulls in `@/components/ui/toast`, which reaches
// `@expo/vector-icons` at import time — no icon rendering machinery exists
// under vitest's node environment (same as `competency-manager.test.tsx`).
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { StudentEvaluationsBlock } from "./student-evaluations-block";

function card(recordId: number): EvaluationCard {
  return {
    recordId,
    coachName: "Ana",
    evaluatedOn: "2026-09-21",
    className: null,
    sharedAt: "2026-09-21T14:05:11",
    ratings: [{ name: "Técnica", key: null, score: 4, scaleMin: 1, scaleMax: 5 }],
    evolution: [],
    evolutionPeriod: "last",
    note: null,
  };
}

function block(cards: EvaluationCard[]): DashboardEvaluationsBlock {
  return { id: "evaluations", type: "evaluations", data: { cards, href: "/evaluations" } };
}

beforeEach(() => {
  nav.push.mockReset();
});

describe("StudentEvaluationsBlock", () => {
  it("caps at 3 cards even if the server ever sent more", async () => {
    const cards = [card(1), card(2), card(3), card(4)];
    const n = await renderNative(createElement(StudentEvaluationsBlock, { block: block(cards) }));
    expect(n.queryByTestId("evaluation-card-1")).not.toBeNull();
    expect(n.queryByTestId("evaluation-card-2")).not.toBeNull();
    expect(n.queryByTestId("evaluation-card-3")).not.toBeNull();
    expect(n.queryByTestId("evaluation-card-4")).toBeNull();
  });

  it("'Ver todas' pushes /evaluations", async () => {
    const n = await renderNative(createElement(StudentEvaluationsBlock, { block: block([card(1)]) }));
    await n.press("student-evaluations-see-all");
    expect(nav.push).toHaveBeenCalledWith("/evaluations");
  });
});
