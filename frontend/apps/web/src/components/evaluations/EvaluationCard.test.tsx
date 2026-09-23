/**
 * `evaluations.sharing` rule 3 / `evaluations.student-view` rule 6 (PAD-402): the
 * ONE card component draws exactly the `Card` it is given — no delta, no sort, no
 * decision about which ratings are "stars" (a player never gets a competency id).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { EvaluationCard as EvaluationCardType } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));

import { EvaluationCard } from "./EvaluationCard";

const CARD: EvaluationCardType = {
  recordId: 42,
  coachName: "Ana Ferreira",
  evaluatedOn: "2026-09-21",
  className: "Aula 5",
  sharedAt: "2026-09-21T14:05:11",
  ratings: [
    { name: "Técnica", key: "technique", score: 4, scaleMin: 1, scaleMax: 5 },
    { name: "Tática", key: "tactics", score: 3, scaleMin: 1, scaleMax: 5 },
  ],
  evolution: [
    { name: "Técnica", key: "technique", delta: 1.5 },
    { name: "Tática", key: "tactics", delta: -0.5 },
    { name: "Consistência", key: null, delta: 0 },
  ],
  evolutionPeriod: "6m",
  note: "Boa sessão",
};

describe("EvaluationCard", () => {
  it("renders the card exactly as sent: coach, date, class, every rating", () => {
    render(<EvaluationCard card={CARD} />);
    expect(screen.getByTestId("evaluation-shared-card-42")).toBeTruthy();
    expect(screen.getByTestId("evaluation-shared-card-coach").textContent).toContain("Ana Ferreira");
    expect(screen.getByTestId("evaluation-shared-card-class").textContent).toContain("Aula 5");

    const ratings = screen.getByTestId("evaluation-shared-card-ratings");
    expect(within(ratings).getByText("4/5")).toBeTruthy();
    expect(within(ratings).getByText("3/5")).toBeTruthy();
  });

  it("shows one evolution line per competency with the sign and never a re-derived value", () => {
    render(<EvaluationCard card={CARD} />);
    const up = screen.getByTestId("evaluation-shared-card-evolution-0");
    expect(up.textContent).toContain("+1.5");
    expect(up.querySelector(".text-success")).toBeTruthy();

    const down = screen.getByTestId("evaluation-shared-card-evolution-1");
    expect(down.textContent).toContain("-0.5");
    expect(down.querySelector(".text-success")).toBeNull();

    const flat = screen.getByTestId("evaluation-shared-card-evolution-2");
    expect(flat.textContent).toContain("=");
  });

  it("shows the note and the shared-on line when the card carries them", () => {
    render(<EvaluationCard card={CARD} />);
    expect(screen.getByTestId("evaluation-shared-card-note").textContent).toContain("Boa sessão");
    expect(screen.getByTestId("evaluation-shared-card-shared-at")).toBeTruthy();
  });

  it("omits class, note, shared-on and evolution entirely when the card carries none", () => {
    const bare: EvaluationCardType = { ...CARD, className: null, note: null, sharedAt: null, evolution: [] };
    render(<EvaluationCard card={bare} />);
    const scope = screen.getByTestId("evaluation-shared-card-42");
    expect(within(scope).queryByTestId("evaluation-shared-card-class")).toBeNull();
    expect(within(scope).queryByTestId("evaluation-shared-card-note")).toBeNull();
    expect(within(scope).queryByTestId("evaluation-shared-card-shared-at")).toBeNull();
    expect(within(scope).queryByTestId("evaluation-shared-card-evolution")).toBeNull();
  });
});
