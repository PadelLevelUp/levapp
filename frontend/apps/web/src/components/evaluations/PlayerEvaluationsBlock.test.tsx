/**
 * players.profile rule 10 and evaluations.history rule 2 (PAD-834): the profile's Avaliações block —
 * the date line, the entry points into the drawer, the last evaluation, and the Evolução gate.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { EvaluationCompetencies, EvaluationRecord, PlayerEvaluations } from "@levelup/types";

const state = {
  evaluations: null as PlayerEvaluations | null,
  competencies: null as EvaluationCompetencies | null,
  put: vi.fn(),
  remove: vi.fn(),
  loading: { history: false, competencies: false },
};

vi.mock("@levelup/hooks", async () => ({
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useHeldWhile")>(
    "../../../../../packages/hooks/src/useHeldWhile"
  )),
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useEvaluationFormSession")>(
    "../../../../../packages/hooks/src/useEvaluationFormSession"
  )),
  usePlayerEvaluations: () => ({ data: state.loading.history ? undefined : state.evaluations, isLoading: state.loading.history, isError: false }),
  useEvaluationCompetencies: () => ({ data: state.loading.competencies ? undefined : state.competencies, isLoading: state.loading.competencies, isError: false }),
  usePutEvaluationRecord: () => ({ mutateAsync: state.put }),
  useDeleteEvaluationRecord: () => ({ mutateAsync: state.remove, isPending: false }),
  usePlayerEvolution: () => ({ data: undefined, isLoading: false, isError: false }),
  // PAD-402 (evaluations.sharing): the history card's share control and its dialog
  // mount alongside every row here — covered on their own in EvaluationHistoryCard.test.tsx
  // and ShareEvaluationDialog.test.tsx, so these are inert stand-ins.
  useUnshareEvaluation: () => ({ mutateAsync: vi.fn() }),
  useShareEvaluationPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShareEvaluation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts && "date" in opts ? `${key}|${opts.date}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

import { PlayerEvaluationsBlock } from "./PlayerEvaluationsBlock";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  class RO { observe() {} unobserve() {} disconnect() {} }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const rating = (categoryId: number, name: string, score: number, max = 5, key: string | null = null) =>
  ({ categoryId, name, key, score, scaleMin: 1, scaleMax: max });
const record = (over: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: 1, evaluatedOn: "2026-09-21", classInstanceId: null, className: null, note: null, editable: true,
  ratings: [], share: null, ...over,
});

const JOAO: PlayerEvaluations = {
  lastEvaluatedOn: "2026-09-21",
  competenciesWithData: [12, 3],
  records: [
    record({ id: 9, classInstanceId: 88, className: "Aula 5", ratings: [rating(12, "Bandeja", 4, 5, "bandeja")],
             note: "Continua a trabalhar a tomada de decisão no ataque." }),
    record({ id: 8, ratings: [rating(3, "Técnica", 3, 5, "technique")] }),
    record({ id: 2, evaluatedOn: "2026-06-18", editable: false,
             ratings: [rating(12, "Bandeja", 4, 5, "bandeja"), rating(30, "Forehand", 7, 10)] }),
  ],
};
const SET: EvaluationCompetencies = {
  catalogue: [],
  competencies: [
    { id: 3, key: "technique", name: "Técnica", group: "general", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: 0, scoreCount: 1 },
    { id: 12, key: "bandeja", name: "Bandeja", group: "technique", scaleMin: 1, scaleMax: 5, isActive: false, sortOrder: null, scoreCount: 2 },
  ],
};

beforeEach(() => {
  state.evaluations = JOAO;
  state.competencies = SET;
  state.put = vi.fn(async () => JOAO.records[1]);
  state.remove = vi.fn(async () => undefined);
  state.loading = { history: false, competencies: false };
});

const handlers = () => ({ onOpenHistory: vi.fn(), onNew: vi.fn(), onEdit: vi.fn() });
const mount = (h = handlers()) => {
  render(<PlayerEvaluationsBlock playerId="9" authorName="Ana Coach" {...h} />);
  return h;
};

describe("the profile's Avaliações block", () => {
  it("[EVALUATIONS-HISTORY-2] names the last evaluation in the active locale, from the server's date", () => {
    mount();
    expect(screen.getByTestId("evaluation-card-last").textContent).toContain("21 set 2026");
  });

  it("[EVALUATIONS-HISTORY-2] says so when there is none, and still offers 'Avaliações'", () => {
    state.evaluations = { lastEvaluatedOn: null, records: [], competenciesWithData: [] };
    const h = mount();
    expect(screen.getByTestId("evaluation-card-last").textContent).toBe("players.evaluationHistory.none");
    // "Histórico (0)" keeps the drawer's entry id; "Fazer primeira avaliação" opens the form.
    fireEvent.click(screen.getByTestId("player-evaluations-open"));
    expect(h.onOpenHistory).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("profile-evaluations-first"));
    expect(h.onNew).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("profile-evaluation-last")).toBeNull();
  });

  it("[PLAYERS-PROFILE-16] the newest record, its author, stars and note, edit only today", () => {
    const h = mount();
    const last = within(screen.getByTestId("profile-evaluation-last"));
    expect(screen.getByTestId("profile-evaluation-last").getAttribute("data-record-id")).toBe("9");
    expect(last.getByTestId("profile-evaluation-last-author").getAttribute("data-author")).toBe("Ana Coach");
    expect(last.getByTestId("evaluation-stars-12").getAttribute("data-score")).toBe("4");
    expect(last.getByTestId("profile-evaluation-last-note").textContent).toContain("tomada de decisão");
    fireEvent.click(last.getByTestId("profile-evaluation-last-edit"));
    expect(h.onEdit).toHaveBeenCalledWith(JOAO.records[0]);
    fireEvent.click(screen.getByTestId("profile-evaluations-new"));
    expect(h.onNew).toHaveBeenCalledTimes(1);
  });

  it("[PLAYERS-PROFILE-16] an earlier day's last evaluation offers no Editar", () => {
    state.evaluations = { ...JOAO, records: [JOAO.records[2]] };
    mount();
    expect(screen.queryByTestId("profile-evaluation-last-edit")).toBeNull();
  });

  it("[PLAYERS-PROFILE-17] one record shows the gate, two show the evolution", () => {
    state.evaluations = { ...JOAO, records: [JOAO.records[1]] };
    const one = render(<PlayerEvaluationsBlock playerId="9" authorName="" {...handlers()} />);
    expect(screen.getByTestId("profile-evolution-gate")).toBeTruthy();
    expect(screen.queryByTestId("evaluation-evolution")).toBeNull();
    one.unmount();
    state.evaluations = JOAO;
    mount();
    expect(screen.queryByTestId("profile-evolution-gate")).toBeNull();
    expect(screen.getByTestId("evaluation-evolution")).toBeTruthy();
  });
});
