/** players.nickname rule 8 (PAD-660): the evaluations drawer titles itself with the coach's name for the student. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@levelup/hooks", async () => ({
  useCoachDisplayName: () => (id: unknown, real: string | null | undefined) =>
    String(id) === "9" ? "Jorge chato" : (real ?? ""),
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useHeldWhile")>(
    "../../../../../packages/hooks/src/useHeldWhile"
  )),
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useEvaluationFormSession")>(
    "../../../../../packages/hooks/src/useEvaluationFormSession"
  )),
  usePlayerEvaluations: () => ({ data: { lastEvaluatedOn: null, competenciesWithData: [], records: [] }, isLoading: false, isError: false }),
  useEvaluationCompetencies: () => ({ data: { catalogue: [], competencies: [] }, isLoading: false, isError: false }),
  usePutEvaluationRecord: () => ({ mutateAsync: vi.fn() }),
  useDeleteEvaluationRecord: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePlayerEvolution: () => ({ data: undefined, isLoading: false, isError: false }),
  useUnshareEvaluation: () => ({ mutateAsync: vi.fn() }),
  useShareEvaluationPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShareEvaluation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}|${opts.name}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

import { PlayerEvaluationsDrawer } from "./PlayerEvaluationsDrawer";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  class RO { observe() {} unobserve() {} disconnect() {} }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

describe("PlayerEvaluationsDrawer title", () => {
  it("prints the nickname for one student and the real name for another", () => {
    const { unmount } = render(<PlayerEvaluationsDrawer open playerId="9" playerName="Jorge Silva" onClose={vi.fn()} />);
    expect(screen.getByText(/evaluationHistory\.title/).textContent).toBe("players.evaluationHistory.title|Jorge chato");
    unmount();
    render(<PlayerEvaluationsDrawer open playerId="10" playerName="Ana Pinto" onClose={vi.fn()} />);
    expect(screen.getByText(/evaluationHistory\.title/).textContent).toBe("players.evaluationHistory.title|Ana Pinto");
  });
});
