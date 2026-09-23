/**
 * evaluations.class-panel rules 2-7 and 9 (PAD-376): the participant accordion the
 * class detail swaps to. The server decides who is listed, in what order and which
 * record a row shows; this asserts what the panel does with a known read.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ClassEvaluations, EvaluationCompetencies, EvaluationCompetency, EvaluationRecord } from "@levelup/types";

const state = {
  read: null as ClassEvaluations | null,
  known: null as EvaluationCompetencies | null,
  put: vi.fn(),
  asked: [] as unknown[],
};

vi.mock("@levelup/hooks", async () => ({
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useHeldWhile")>(
    "../../../../../packages/hooks/src/useHeldWhile"
  )),
  ...(await vi.importActual<typeof import("../../../../../packages/hooks/src/useEvaluationFormSession")>(
    "../../../../../packages/hooks/src/useEvaluationFormSession"
  )),
  useClassEvaluations: (ref: unknown) => {
    state.asked.push(ref);
    return { data: state.read ?? undefined, isLoading: state.read === null, isError: false };
  },
  useEvaluationCompetencies: () => ({ data: state.known ?? undefined, isLoading: false, isError: false }),
  usePutEvaluationRecord: (playerId: string) => ({ mutateAsync: (input: unknown) => state.put(playerId, input) }),
  // PAD-402: `EvaluationHistoryCard` (the earlier-record card here) always calls this
  // hook — this panel never passes it a player, so the share control stays hidden and
  // this stub is never exercised, only mounted.
  useUnshareEvaluation: () => ({ mutateAsync: vi.fn() }),
  useShareEvaluation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

import { ClassEvaluationsPanel } from "./ClassEvaluationsPanel";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const competency = (id: number, name: string, over: Partial<EvaluationCompetency> = {}): EvaluationCompetency => ({
  id, key: null, name, group: "general", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over,
});
const TECNICA = competency(1, "Técnica", { key: "technique" });
const TATICA = competency(2, "Tática", { key: "tactics" });
const CONSISTENCIA = competency(3, "Consistência", { key: "consistency" });
const BANDEJA = competency(12, "Bandeja", { key: "bandeja", group: "technique", isActive: false });
const ACTIVE = [TECNICA, TATICA, CONSISTENCIA];

const rating = (c: EvaluationCompetency, score: number) =>
  ({ categoryId: c.id, name: c.name, key: c.key, score, scaleMin: c.scaleMin, scaleMax: c.scaleMax });
const record = (over: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: 1, evaluatedOn: "2026-09-21", classInstanceId: 88, className: "Aula 5", note: null, editable: true, ratings: [], share: null, ...over,
});
const participant = (playerId: number, name: string, over: Partial<ClassEvaluations["participants"][number]> = {}) => ({
  playerId, coachPlayerId: playerId + 800, name, absent: false, due: false, record: null, ...over,
});

const REF = { model: "Lesson", id: 7, date: "2026-09-21" };
const CLASS_88: ClassEvaluations = {
  classInstanceId: 88,
  canRate: true,
  competencies: ACTIVE,
  participants: [
    participant(21, "Tiago"),
    participant(22, "Sara", { record: record({ id: 5, ratings: [rating(TECNICA, 4)] }) }),
    participant(23, "João", { record: record({ id: 6, ratings: [rating(BANDEJA, 4)], note: "Continua a trabalhar a tomada de decisão no ataque." }) }),
    participant(20, "Rui", { absent: true }),
  ],
};

beforeEach(() => {
  state.read = CLASS_88;
  state.known = { catalogue: [], competencies: [...ACTIVE, BANDEJA] };
  state.put = vi.fn(async () => record({ id: 40 }));
  state.asked = [];
  navigate.mockClear();
});

const show = (onBack = vi.fn()) => ({ onBack, ...render(<ClassEvaluationsPanel classRef={REF} className="Aula 5" onBack={onBack} />) });
const toggle = (playerId: number) => fireEvent.click(screen.getByTestId(`class-eval-row-toggle-${playerId}`));
const summary = (playerId: number) => screen.getByTestId(`class-eval-summary-${playerId}`);

describe("the panel", () => {
  it("is titled with the class, reads that dated occurrence, and goes back to the class detail", () => {
    const { onBack } = show();
    expect(screen.getByTestId("class-eval-title").textContent).toContain("Aula 5");
    expect(state.asked[0]).toEqual(REF);
    fireEvent.click(screen.getByTestId("class-eval-back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("lists the participants in the server's order — absent last — and marks the absent one", () => {
    show();
    const rows = screen.getAllByTestId(/^class-eval-row-\d+$/).map((row) => row.getAttribute("data-testid"));
    expect(rows).toEqual(["class-eval-row-21", "class-eval-row-22", "class-eval-row-23", "class-eval-row-20"]);
    expect(screen.getByTestId("class-eval-absent-20")).toBeTruthy();
    expect(screen.queryByTestId("class-eval-absent-21")).toBeNull();
  });

  it("starts collapsed, and opens one row at a time", () => {
    show();
    expect(screen.queryByTestId("evaluation-form")).toBeNull();
    toggle(21);
    expect(within(screen.getByTestId("class-eval-row-21")).getByTestId("evaluation-form")).toBeTruthy();
    toggle(22);
    expect(within(screen.getByTestId("class-eval-row-21")).queryByTestId("evaluation-form")).toBeNull();
    expect(within(screen.getByTestId("class-eval-row-22")).getByTestId("evaluation-form")).toBeTruthy();
    toggle(22);
    expect(screen.queryByTestId("evaluation-form")).toBeNull();
  });

  it("reaches the competency manager twice: beside the heading and under the list", () => {
    show();
    fireEvent.click(screen.getByTestId("class-eval-manage-header"));
    fireEvent.click(screen.getByTestId("class-eval-manage-footer"));
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});

describe("the row summary", () => {
  it("reads 'no evaluation' only when the row's record rates nothing", () => {
    show();
    expect(summary(21).getAttribute("data-rated")).toBe("0");
    expect(summary(22).getAttribute("data-rated")).toBe("1");
    expect(summary(22).getAttribute("data-total")).toBe("3");
  });

  it("counts a rating under a switched-off competency: 1 of 4, never 'no evaluation'", () => {
    show();
    expect(summary(23).getAttribute("data-rated")).toBe("1");
    expect(summary(23).getAttribute("data-total")).toBe("4");
  });
});

describe("the expanded row", () => {
  it("lists the switched-off competency the record rates, as stars, with the note pre-filled", () => {
    show();
    toggle(23);
    const row = within(screen.getByTestId("class-eval-row-23"));
    expect(row.getByTestId("evaluation-stars-12").getAttribute("data-score")).toBe("4");
    expect((row.getByTestId("evaluation-note") as HTMLTextAreaElement).value).toContain("tomada de decisão");
  });

  it("every tap is a PUT for THAT player carrying the panel's class", async () => {
    show();
    toggle(21);
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-star-2-3")));
    expect(state.put).toHaveBeenCalledWith("21", { ratings: { "2": 3 }, classRef: REF });
  });

  it("sends the record's id when the row's record is today's", async () => {
    show();
    toggle(22);
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-star-2-5")));
    expect(state.put).toHaveBeenCalledWith("22", { ratings: { "2": 5 }, recordId: 5, classRef: REF });
  });

  it("'Concluir avaliação' collapses the row", async () => {
    show();
    toggle(21);
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-finish")));
    expect(screen.queryByTestId("evaluation-form")).toBeNull();
  });
});

describe("a record made on an earlier day (Q28)", () => {
  beforeEach(() => {
    state.read = {
      ...CLASS_88,
      participants: [participant(20, "Rui", { record: record({ id: 3, evaluatedOn: "2026-09-20", editable: false, ratings: [rating(TECNICA, 4)] }) })],
    };
  });

  it("still counts in the summary, and is shown read-only with its date — no edit, no delete", () => {
    show();
    expect(summary(20).getAttribute("data-rated")).toBe("1");
    toggle(20);
    const earlier = within(screen.getByTestId("class-eval-earlier-20"));
    expect(earlier.getByTestId("evaluation-history-card-3")).toBeTruthy(); // the date is rendered copy: asserted by the card's id
    expect(earlier.getByTestId("evaluation-stars-1").getAttribute("data-score")).toBe("4");
    expect(earlier.queryByTestId("evaluation-history-delete-3")).toBeNull();
    expect(earlier.queryByTestId("evaluation-history-edit-3")).toBeNull();
  });

  it("after the first tap the read returns TODAY's record, and the earlier-day card stays put while the row is open (review F1, Q33)", async () => {
    const view = show();
    toggle(20);
    expect(screen.getByTestId("class-eval-earlier-20")).toBeTruthy();
    await act(async () => fireEvent.click(within(screen.getByTestId("evaluation-form")).getByTestId("evaluation-star-2-3")));
    // the write invalidated the read: the participant's most recent record is now today's (Q28)
    state.read = { ...CLASS_88, participants: [participant(20, "Rui", { record: record({ id: 41, ratings: [rating(TATICA, 3)] }) })] };
    view.rerender(<ClassEvaluationsPanel classRef={REF} className="Aula 5" onBack={view.onBack} />);
    expect(screen.getByTestId("class-eval-earlier-20"), "the card above the form did not unmount under the finger").toBeTruthy();
    expect(within(screen.getByTestId("evaluation-form")).getByTestId("evaluation-stars-2").getAttribute("data-score")).toBe("3");
    // closing the row releases the hold: reopened, the row is today's record alone
    toggle(20);
    toggle(20);
    expect(screen.queryByTestId("class-eval-earlier-20")).toBeNull();
    expect(within(screen.getByTestId("evaluation-form")).getByTestId("evaluation-stars-2").getAttribute("data-score")).toBe("3");
  });

  it("the form beside it starts empty, and the first tap starts today's record: no recordId, the same class", async () => {
    show();
    toggle(20);
    const form = within(screen.getByTestId("evaluation-form"));
    expect(form.getByTestId("evaluation-stars-1").getAttribute("data-score")).toBe("");
    await act(async () => fireEvent.click(form.getByTestId("evaluation-star-2-3")));
    expect(state.put).toHaveBeenCalledWith("20", { ratings: { "2": 3 }, classRef: REF });
  });
});

describe("nothing to list (rule 6, AV-071)", () => {
  it("is an empty state with the way into the manager and no note field; the summary reads 'no evaluation'", () => {
    state.read = { ...CLASS_88, competencies: [], participants: [participant(21, "Tiago")] };
    show();
    expect(summary(21).getAttribute("data-rated")).toBe("0");
    toggle(21);
    const row = within(screen.getByTestId("class-eval-row-21"));
    expect(row.getByTestId("class-eval-empty")).toBeTruthy();
    expect(row.queryByTestId("evaluation-note")).toBeNull();
    fireEvent.click(row.getByTestId("class-eval-empty-manage"));
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe("the panel owns its state (rule 9)", () => {
  it("another class starts collapsed: no open row and no note text carried over", () => {
    const first = show();
    toggle(23);
    expect(screen.getByTestId("evaluation-note")).toBeTruthy();
    first.unmount();
    state.read = { ...CLASS_88, classInstanceId: 89, participants: [participant(23, "João")] };
    render(<ClassEvaluationsPanel classRef={{ model: "LessonInstance", id: 89 }} className="Aula 6" onBack={vi.fn()} />);
    expect(screen.queryByTestId("evaluation-form")).toBeNull();
    expect(screen.queryByTestId("evaluation-note")).toBeNull();
  });

  it("while a row is open the order is held: a participant marked absent elsewhere does not reorder rows under the finger", () => {
    const view = show();
    toggle(22);
    state.read = { ...CLASS_88, participants: [CLASS_88.participants[1], CLASS_88.participants[2], { ...CLASS_88.participants[0], absent: true }, CLASS_88.participants[3]] };
    view.rerender(<ClassEvaluationsPanel classRef={REF} className="Aula 5" onBack={view.onBack} />);
    const order = () => screen.getAllByTestId(/^class-eval-row-\d+$/).map((row) => row.getAttribute("data-testid"));
    expect(order()).toEqual(["class-eval-row-21", "class-eval-row-22", "class-eval-row-23", "class-eval-row-20"]);
    toggle(22);
    expect(order()).toEqual(["class-eval-row-22", "class-eval-row-23", "class-eval-row-21", "class-eval-row-20"]);
  });
});
