/**
 * PAD-403 (evaluations.legacy-conversion rules 5, 8): the history card draws a rating from
 * its own scale. A converted legacy category (key null, 1-5) is stars like any competency;
 * the stepper's "n/max" remains only for a scale that is not 1-5, which the server no
 * longer holds.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EvaluationRecord } from "@levelup/types";
import { EvaluationHistoryCard } from "./EvaluationHistoryCard";

// The card calls the PAD-402 share hooks unconditionally (rules of hooks); this file is
// about drawing each rating from its scale, so they are inert here.
vi.mock("@levelup/hooks", () => ({
  useShareEvaluation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnshareEvaluation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts && Object.keys(opts).length ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "en" },
  }),
}));

const RECORD: EvaluationRecord = {
  id: 7, evaluatedOn: "2026-09-10", classInstanceId: null, className: null, note: null, editable: false, share: null,
  ratings: [
    { categoryId: 3, name: "Volley", key: null, score: 3, scaleMin: 1, scaleMax: 5 },      // converted legacy
    { categoryId: 1, name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 },
    { categoryId: 9, name: "Smash", key: null, score: 7, scaleMin: 1, scaleMax: 10 },       // off-scale: dormant stepper
  ],
};

describe("EvaluationHistoryCard draws each rating from its own scale", () => {
  it("a converted legacy category is stars", () => {
    render(<EvaluationHistoryCard record={RECORD} />);
    expect(screen.getByTestId("evaluation-stars-3").getAttribute("data-score")).toBe("3");
    expect(screen.queryByTestId("evaluation-stepper-3-value")).toBeNull();
    expect(screen.getByTestId("evaluation-stars-1").getAttribute("data-score")).toBe("4");
  });

  it("a scale that is not 1-5 stays a number", () => {
    render(<EvaluationHistoryCard record={RECORD} />);
    expect(screen.queryByTestId("evaluation-stars-9")).toBeNull();
    expect(screen.getByTestId("evaluation-stepper-9-value").getAttribute("data-score")).toBe("7");
  });
});
