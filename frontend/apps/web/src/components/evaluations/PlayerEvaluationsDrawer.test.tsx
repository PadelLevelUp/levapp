/**
 * evaluations.history rules 2-8 and 10 (PAD-374): the profile card, the
 * "Avaliações — {nome}" drawer, the history cards and delete.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { EvaluationCompetencies, EvaluationRecord, PlayerEvaluations } from "@levelup/types";

const state = {
  evaluations: null as PlayerEvaluations | null,
  competencies: null as EvaluationCompetencies | null,
  put: vi.fn(),
  remove: vi.fn(),
  loading: { history: false, competencies: false },
};

vi.mock("@levelup/hooks", async () => ({
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

import { PlayerEvaluationsDrawer } from "./PlayerEvaluationsDrawer";
import { EvaluationSummaryCard } from "./EvaluationSummaryCard";

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

const open = () => render(<PlayerEvaluationsDrawer open playerId="9" playerName="João Silva" onClose={vi.fn()} />);

describe("the profile card", () => {
  it("names the last evaluation in the active locale, from the server's date", () => {
    render(<EvaluationSummaryCard lastEvaluatedOn="2026-09-21" onOpen={vi.fn()} />);
    expect(screen.getByTestId("evaluation-card-last").textContent).toContain("21 set 2026");
  });

  it("says so when there is none, and still offers 'Avaliações'", () => {
    const onOpen = vi.fn();
    render(<EvaluationSummaryCard lastEvaluatedOn={null} onOpen={onOpen} />);
    expect(screen.getByTestId("evaluation-card-last").textContent).toBe("players.evaluationHistory.none");
    fireEvent.click(screen.getByTestId("player-evaluations-open"));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("the history", () => {
  it("is one card per record, newest first, the class one carrying its class name", () => {
    open();
    const cards = screen.getAllByTestId(/^evaluation-history-card-/);
    expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
      "evaluation-history-card-9", "evaluation-history-card-8", "evaluation-history-card-2",
    ]);
    expect(within(cards[0]).getByTestId("evaluation-history-class").textContent).toContain("Aula 5");
    expect(within(cards[1]).queryByTestId("evaluation-history-class")).toBeNull();
    expect(within(cards[0]).getByTestId("evaluation-history-note").textContent).toContain("tomada de decisão");
  });

  it("shows a switched-off competency on its card, stars for 1-5 and n/max for a legacy scale", () => {
    open();
    const june = screen.getByTestId("evaluation-history-card-2");
    expect(within(june).getByTestId("evaluation-stars-12").getAttribute("data-score")).toBe("4");
    expect(within(june).queryByTestId("evaluation-stars-30")).toBeNull();
    expect(within(june).getByTestId("evaluation-stepper-30-value").getAttribute("data-score")).toBe("7");
  });

  it("offers edit on today's cards only, delete on every card, and no share control", () => {
    open();
    expect(screen.queryByTestId("evaluation-history-edit-2")).toBeNull();
    expect(screen.getByTestId("evaluation-history-edit-8")).toBeTruthy();
    expect(screen.getByTestId("evaluation-history-delete-2")).toBeTruthy();
    expect(screen.queryByText(/partilhar/i)).toBeNull();
  });

  it("deletes after a confirmation that names the date", async () => {
    open();
    fireEvent.click(screen.getByTestId("evaluation-history-delete-2"));
    expect(screen.getByTestId("evaluation-delete-title").textContent).toContain("18 jun 2026");
    expect(state.remove).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-delete-confirm")));
    expect(state.remove).toHaveBeenCalledWith(2);
  });

  it("an empty history still offers 'Nova avaliação', and the evolution slot says why it is empty", () => {
    state.evaluations = { lastEvaluatedOn: null, records: [], competenciesWithData: [] };
    open();
    expect(screen.getByTestId("evaluation-history-empty")).toBeTruthy();
    expect(screen.getByTestId("evaluation-evolution-empty")).toBeTruthy();
    expect(screen.getByTestId("evaluation-new")).toBeTruthy();
  });
});

describe("'Nova avaliação' waits for its data (review F3)", () => {
  it("is disabled until the competency set has loaded, so an early tap never shows the zero-competency state falsely", () => {
    state.loading.competencies = true;
    open();
    expect((screen.getByTestId("evaluation-new") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("evaluation-new"));
    expect(screen.queryByTestId("evaluation-form")).toBeNull();
    expect(screen.queryByTestId("evaluation-form-empty")).toBeNull();
  });

  it("is disabled until the history has loaded, so the form never opens blank over an existing record", () => {
    state.loading.history = true;
    open();
    expect((screen.getByTestId("evaluation-new") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("'Nova avaliação'", () => {
  it("opens on today's class-less record, pre-filled, hides the action, and lists no switched-off competency", () => {
    open();
    fireEvent.click(screen.getByTestId("evaluation-new"));
    expect(screen.queryByTestId("evaluation-new")).toBeNull();
    const form = within(screen.getByTestId("evaluation-form")); // the same star row also sits on the history card
    expect(form.getByTestId("evaluation-stars-3").getAttribute("data-score")).toBe("3");
    expect(form.queryByTestId("evaluation-row-12")).toBeNull(); // Bandeja is switched off and not rated in that record
  });

  it("nothing above the open form changes shape: a first rating does not make 'Evolução' appear until the form closes", async () => {
    state.evaluations = { lastEvaluatedOn: null, records: [], competenciesWithData: [] };
    const view = open();
    fireEvent.click(screen.getByTestId("evaluation-new"));
    // the tap was saved and the history refetched: the player now has data
    state.evaluations = { ...JOAO, records: [JOAO.records[1]], competenciesWithData: [3] };
    view.rerender(<PlayerEvaluationsDrawer open playerId="9" playerName="João Silva" onClose={vi.fn()} />);
    expect(screen.getByTestId("evaluation-history-card-8")).toBeTruthy(); // the history below the form does follow
    expect(screen.getByTestId("evaluation-evolution-empty")).toBeTruthy();
    expect(screen.queryByTestId("evolution-pill-3")).toBeNull();
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-finish")));
    expect(screen.queryByTestId("evaluation-evolution-empty")).toBeNull();
    expect(screen.getByTestId("evolution-pill-3")).toBeTruthy();
  });

  it("closing it untouched sends nothing", async () => {
    open();
    fireEvent.click(screen.getByTestId("evaluation-new"));
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-finish")));
    expect(state.put).not.toHaveBeenCalled();
    expect(screen.getByTestId("evaluation-new")).toBeTruthy();
  });

  it("editing a class record carries that record's class", async () => {
    open();
    fireEvent.click(screen.getByTestId("evaluation-history-edit-9"));
    // Bandeja is switched off but already rated in THIS record, so it is listed (Q26)
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-star-12-5")));
    expect(state.put).toHaveBeenCalledWith({
      ratings: { "12": 5 }, recordId: 9, classRef: { model: "LessonInstance", id: 88 },
    });
  });
});
