/**
 * `evaluations.student-view` rules 4-6 (PAD-402): the dashboard block — up to 3
 * cards, and the link to the full list. The server already caps and gates it;
 * this only proves the component renders what it is given.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardEvaluationsBlock, EvaluationCard } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));

import { StudentEvaluationsBlock } from "./StudentEvaluationsBlock";

const card = (recordId: number): EvaluationCard => ({
  recordId, coachName: "Ana Ferreira", evaluatedOn: "2026-09-21", className: null, sharedAt: "2026-09-21T14:05:11",
  ratings: [{ name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 }],
  evolution: [], evolutionPeriod: "last", note: null,
});

const block = (cards: EvaluationCard[]): DashboardEvaluationsBlock => ({
  id: "evaluations", type: "evaluations", data: { cards, href: "/evaluations" },
});

const renderBlock = (b: DashboardEvaluationsBlock) => render(<MemoryRouter><StudentEvaluationsBlock block={b} /></MemoryRouter>);

describe("StudentEvaluationsBlock", () => {
  it("renders one card per shared record", () => {
    renderBlock(block([card(1), card(2)]));
    expect(screen.getByTestId("evaluation-shared-card-1")).toBeTruthy();
    expect(screen.getByTestId("evaluation-shared-card-2")).toBeTruthy();
  });

  it("never renders more than 3, even if the payload somehow carried more", () => {
    renderBlock(block([card(1), card(2), card(3), card(4)]));
    expect(screen.getAllByTestId(/^evaluation-shared-card-\d+$/)).toHaveLength(3);
  });

  it("the 'Ver todas' link points at the block's own href", () => {
    renderBlock(block([card(1)]));
    expect(screen.getByTestId("student-evaluations-see-all").getAttribute("href")).toBe("/evaluations");
  });
});
