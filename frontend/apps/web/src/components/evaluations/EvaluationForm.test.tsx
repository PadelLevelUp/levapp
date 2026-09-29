/**
 * evaluations.history rules 4-5 and evaluations.records rules 7, 10, 11 (PAD-374):
 * "Nova avaliação" saves each input as it is made — there is no save button to
 * retry from, so a failed save must be visible and the control must roll back.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { EvaluationCompetency, EvaluationRecord, PutEvaluationRecordResult } from "@levelup/types";
import { EvaluationForm } from "./EvaluationForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts?.defaultValue as string) ?? (opts && Object.keys(opts).length ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "en" },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  // Radix's slider (a 1-10 competency's input, PAD-423) measures itself.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const competency = (over: Partial<EvaluationCompetency>): EvaluationCompetency => ({
  id: 1, key: null, name: "X", group: "custom", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0,
  ...over,
});
const TECNICA = competency({ id: 1, key: "technique", name: "Técnica", group: "general" });
const FOREHAND = competency({ id: 2, name: "Forehand", group: null, scaleMin: 1, scaleMax: 10 });

const record = (over: Partial<EvaluationRecord> = {}): EvaluationRecord => ({
  id: 40, evaluatedOn: "2026-09-21", classInstanceId: null, className: null, note: null, editable: true,
  ratings: [], share: null, ...over,
});

function setup(props: Partial<Parameters<typeof EvaluationForm>[0]> = {}) {
  const onSave = vi.fn<(input: unknown) => Promise<PutEvaluationRecordResult>>(async () => record());
  const onClose = vi.fn();
  const onManageCompetencies = vi.fn();
  render(
    <EvaluationForm
      competencies={[TECNICA, FOREHAND]}
      record={null}
      onSave={onSave}
      onClose={onClose}
      onManageCompetencies={onManageCompetencies}
      {...props}
    />
  );
  return { onSave: (props.onSave as typeof onSave) ?? onSave, onClose, onManageCompetencies };
}

const star = (id: number, n: number) => screen.getByTestId(`evaluation-star-${id}-${n}`);
const lit = (id: number) =>
  [1, 2, 3, 4, 5].filter((n) => star(id, n).getAttribute("data-lit") === "true").length;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("stars save on tap", () => {
  it("one tap is one save, carrying only that competency", async () => {
    const { onSave } = setup();
    await act(async () => fireEvent.click(star(1, 4)));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ ratings: { "1": 4 } });
    expect(lit(1)).toBe(4);
  });

  it("sends the record's id once it has one, so a form left open across midnight gets the 409", async () => {
    const { onSave } = setup();
    await act(async () => fireEvent.click(star(1, 4))); // the answer carries id 40
    await act(async () => fireEvent.click(star(1, 2)));
    expect(onSave).toHaveBeenLastCalledWith({ ratings: { "1": 2 }, recordId: 40 });
  });

  it("tapping the lit star clears the rating with null", async () => {
    const { onSave } = setup({ record: record({ ratings: [
      { categoryId: 1, name: "Técnica", key: "technique", score: 3, scaleMin: 1, scaleMax: 5 },
    ] }) });
    expect(lit(1)).toBe(3); // pre-filled from today's record
    await act(async () => fireEvent.click(star(1, 3)));
    expect(onSave).toHaveBeenCalledWith({ ratings: { "1": null }, recordId: 40 });
    expect(lit(1)).toBe(0);
  });

  it("a failed save is visible and the star rolls back", async () => {
    const { toast } = await import("sonner");
    const onSave = vi.fn().mockRejectedValue(new Error("offline"));
    setup({ onSave, record: record({ ratings: [
      { categoryId: 1, name: "Técnica", key: "technique", score: 3, scaleMin: 1, scaleMax: 5 },
    ] }) });
    await act(async () => fireEvent.click(star(1, 5)));
    expect(lit(1)).toBe(3);
    expect(screen.getByTestId("evaluation-save-error")).toBeTruthy();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe("a converted legacy category is stars (PAD-403, evaluations.legacy-conversion rule 5)", () => {
  // After the conversion the server answers every legacy category as 1-5 (group stays null).
  const CONVERTED = competency({ id: 3, name: "Volley", group: null, scaleMin: 1, scaleMax: 5 });

  it("draws five stars, no stepper, pre-filled from the converted score", () => {
    setup({ competencies: [TECNICA, CONVERTED], record: record({ ratings: [
      { categoryId: 3, name: "Volley", key: null, score: 3, scaleMin: 1, scaleMax: 5 },
    ] }) });
    expect(screen.queryByTestId("evaluation-stepper-3-value")).toBeNull();
    expect(lit(3)).toBe(3);
  });

  it("a tap saves that star, like any competency", async () => {
    const { onSave } = setup({ competencies: [TECNICA, CONVERTED] });
    await act(async () => fireEvent.click(star(3, 4)));
    expect(onSave).toHaveBeenCalledWith({ ratings: { "3": 4 } });
    expect(lit(3)).toBe(4);
  });
});

describe("a scale that is not 1-5 keeps the stepper (dormant since PAD-403: the server holds none)", () => {
  it("draws no star for it and shows n/max", async () => {
    setup({ record: record({ ratings: [
      { categoryId: 2, name: "Forehand", key: null, score: 7, scaleMin: 1, scaleMax: 10 },
    ] }) });
    expect(screen.queryByTestId("evaluation-star-2-1")).toBeNull();
    expect(screen.getByTestId("evaluation-stepper-2-value").getAttribute("data-score")).toBe("7");
  });

  it("the value cell is one fixed width in every language: unrated it reads '–/max', never a sentence", () => {
    // pt "Sem classificação" was ~110 pt wide and "6/10" 72 pt, so the first press moved "+" ~40 pt.
    setup();
    const value = screen.getByTestId("evaluation-stepper-2-value");
    expect(value.textContent).toBe("players.evaluationHistory.stepperUnrated|10");
    expect(value.className.split(" ")).toContain("w-[4.5rem]");
    expect(value.className).not.toMatch(/min-w/);
    expect(value.getAttribute("aria-label")).toBe("players.evaluationHistory.notRated");
    fireEvent.click(screen.getByTestId("evaluation-stepper-2-plus"));
    expect(screen.getByTestId("evaluation-stepper-2-value").className.split(" ")).toContain("w-[4.5rem]");
  });

  it("the clear control appearing moves nothing: its place is kept while the category is unrated", () => {
    // jsdom has no layout, so this pins the structure that makes the layout stable: one slot of a
    // fixed size, always there, holding the control only once there is something to clear. Without
    // it the first "+" pushed "−" and "+" sideways under the finger (iOS, and web at phone width).
    setup();
    const slot = screen.getByTestId("evaluation-stepper-2-clear-slot");
    expect(slot.querySelector("button")).toBeNull();
    fireEvent.click(screen.getByTestId("evaluation-stepper-2-plus"));
    expect(screen.getByTestId("evaluation-stepper-2-clear-slot")).toBe(slot);
    expect(slot.contains(screen.getByTestId("evaluation-stepper-2-clear"))).toBe(true);
    expect(slot.className).toContain("h-9 w-9");
  });

  it("consecutive steps are one save, after the quiet period", async () => {
    const { onSave } = setup({ record: record({ ratings: [
      { categoryId: 2, name: "Forehand", key: null, score: 5, scaleMin: 1, scaleMax: 10 },
    ] }) });
    const plus = screen.getByTestId("evaluation-stepper-2-plus");
    fireEvent.click(plus);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(400));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ ratings: { "2": 8 }, recordId: 40 });
  });

  it("'Concluir avaliação' flushes a pending step before it closes", async () => {
    const { onSave, onClose } = setup();
    fireEvent.click(screen.getByTestId("evaluation-stepper-2-plus")); // unrated: starts at the middle, 6
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-finish")));
    expect(onSave).toHaveBeenCalledWith({ ratings: { "2": 6 } });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("failures the review found", () => {
  it("a 409 record_not_editable (the form stayed open past midnight) shows the day-passed message, not 'try again', and stops sending", async () => {
    const onSave = vi.fn().mockRejectedValue({ response: { status: 409, data: { error: "record_not_editable" } } });
    setup({ onSave, record: record() });
    await act(async () => fireEvent.click(star(1, 4)));
    expect(screen.getByTestId("evaluation-save-error").textContent).toBe("players.evaluationHistory.dayPassed");
    expect(lit(1)).toBe(0);
    await act(async () => fireEvent.click(star(1, 5)));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("a failed NOTE save keeps the typed text, says it is unsaved, and retries on demand", async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(record());
    setup({ onSave, record: record({ note: "Antes." }) });
    const note = screen.getByTestId("evaluation-note") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Três frases novas." } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(note.value).toBe("Três frases novas.");
    expect(screen.getByTestId("evaluation-note-unsaved")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-note-retry")));
    expect(onSave).toHaveBeenLastCalledWith({ note: "Três frases novas.", recordId: 40 });
    expect(screen.queryByTestId("evaluation-note-unsaved")).toBeNull();
  });

  it("saves are serialised: a second tap made while the first is in flight carries the id the first returned", async () => {
    let release!: (r: PutEvaluationRecordResult) => void;
    const onSave = vi.fn()
      .mockImplementationOnce(() => new Promise<PutEvaluationRecordResult>((resolve) => { release = resolve; }))
      .mockResolvedValue(record({ id: 41 }));
    setup({ onSave });
    await act(async () => fireEvent.click(star(1, 4)));
    fireEvent.click(screen.getByTestId("evaluation-stepper-2-plus")); // a second competency (a stepper: quiet period first)
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => { release(record({ id: 40 })); });
    expect(onSave).toHaveBeenCalledTimes(1); // the stepper's step is still in its quiet period
    await act(async () => vi.advanceTimersByTime(400));
    expect(onSave).toHaveBeenLastCalledWith({ ratings: { "2": 6 }, recordId: 40 });
  });
});

describe("the private note", () => {
  it("is saved after the quiet period, and an emptied note is sent as \"\"", async () => {
    const { onSave } = setup({ record: record({ note: "Late to the ball." }) });
    const note = screen.getByTestId("evaluation-note") as HTMLTextAreaElement;
    expect(note.value).toBe("Late to the ball.");
    fireEvent.change(note, { target: { value: "" } });
    await act(async () => vi.advanceTimersByTime(800));
    expect(onSave).toHaveBeenCalledWith({ note: "", recordId: 40 });
  });

  it("is flushed on blur", async () => {
    const { onSave } = setup();
    const note = screen.getByTestId("evaluation-note");
    fireEvent.change(note, { target: { value: "Better today." } });
    await act(async () => fireEvent.blur(note));
    expect(onSave).toHaveBeenCalledWith({ note: "Better today." });
  });
});

describe("touching nothing creates nothing", () => {
  it("closing an untouched form sends no request (PAD-337's guarantee)", async () => {
    const { onSave, onClose } = setup();
    await act(async () => fireEvent.click(screen.getByTestId("evaluation-finish")));
    await act(async () => vi.advanceTimersByTime(2000));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("what the form lists", () => {
  it("leaves out a switched-off competency unless today's record already rates it", () => {
    const off = competency({ id: 3, name: "Bandeja", isActive: false });
    setup({ competencies: [TECNICA, off] });
    expect(screen.queryByTestId("evaluation-row-3")).toBeNull();
  });

  it("with nothing to list it is an empty state with a way into the competency manager — never a note-only form", () => {
    const { onManageCompetencies } = setup({ competencies: [competency({ id: 3, isActive: false })] });
    expect(screen.getByTestId("evaluation-form-empty")).toBeTruthy();
    expect(screen.queryByTestId("evaluation-note")).toBeNull();
    fireEvent.click(screen.getByTestId("evaluation-manage-competencies"));
    expect(onManageCompetencies).toHaveBeenCalledTimes(1);
  });
});


describe("a rating the record already holds keeps its own scale (D149)", () => {
  // The coach moved to 1-10 after rating Garra 4 today (on 1-5); Bandeja is new, on 1-10.
  const GARRA = competency({ id: 4, name: "Garra", scaleMin: 1, scaleMax: 10 });
  const BANDEJA = competency({ id: 5, name: "Bandeja", scaleMin: 1, scaleMax: 10 });
  const TODAY = record({ ratings: [{ categoryId: 4, name: "Garra", key: null, score: 4, scaleMin: 1, scaleMax: 5 }] });

  it("draws the earlier 4/5 as four stars, never as 4 on the new 1-10 slider", () => {
    setup({ competencies: [GARRA, BANDEJA], record: TODAY });
    expect(lit(4)).toBe(4);
    expect(screen.queryByTestId("evaluation-slider-4-input")).toBeNull();
    // A competency the record does not rate yet takes the coach's current scale.
    expect(screen.getByTestId("evaluation-slider-5-input")).toBeTruthy();
  });

  it("re-saving it stays on its own 1-5: a tap on the fifth star sends 5", async () => {
    const { onSave } = setup({ competencies: [GARRA, BANDEJA], record: TODAY });
    await act(async () => fireEvent.click(star(4, 5)));
    expect(onSave).toHaveBeenCalledWith({ ratings: { "4": 5 }, recordId: 40 });
  });
});
