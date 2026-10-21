/** players.nickname rule 8 (PAD-660): the class's evaluation rows print the coach's name for each student. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@levelup/hooks", async () => ({
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "21" ? "Jorge chato" : (real ?? ""),
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useHeldWhile")>(
    "../../../../../packages/hooks/src/useHeldWhile"
  )),
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useEvaluationFormSession")>(
    "../../../../../packages/hooks/src/useEvaluationFormSession"
  )),
  useClassEvaluations: () => ({
    data: {
      classInstanceId: 88, canRate: true, competencies: [],
      participants: [
        { playerId: 21, coachPlayerId: 821, name: "Jorge Silva", absent: false, due: false, record: null },
        { playerId: 22, coachPlayerId: 822, name: "Sara Lopes", absent: false, due: false, record: null },
      ],
    },
    isLoading: false, isError: false,
  }),
  useEvaluationCompetencies: () => ({ data: { catalogue: [], competencies: [] }, isLoading: false, isError: false }),
  usePutEvaluationRecord: () => ({ mutateAsync: vi.fn() }),
  useUnshareEvaluation: () => ({ mutateAsync: vi.fn() }),
  useShareEvaluation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

import { ClassEvaluationsPanel } from "./ClassEvaluationsPanel";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

describe("ClassEvaluationsPanel rows", () => {
  it("print the nickname for one student and the real name for another", () => {
    render(<ClassEvaluationsPanel classRef={{ model: "Lesson", id: 7, date: "2026-09-21" }} className="Aula 5" onBack={vi.fn()} />);
    expect(screen.getByTestId("class-eval-row-toggle-21").textContent).toContain("Jorge chato");
    expect(screen.getByTestId("class-eval-row-toggle-21").textContent).not.toContain("Jorge Silva");
    expect(screen.getByTestId("class-eval-row-toggle-22").textContent).toContain("Sara Lopes");
  });
});
