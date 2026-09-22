/**
 * evaluations.records rules 7, 10, 11 and evaluations.history rules 4-5 (PAD-374): the ONE
 * save module both shells render. Every case here was a defect Session-B's review found in
 * the two hand-copied forms: saves sent out of order with a recordId the server had just
 * deleted, the midnight 409 shown as "try again", a failed note save wiping typed text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluationRecord, PutEvaluationRecordResult } from "@levelup/types";
import { createEvaluationFormSession, stableFormRows, type EvaluationFormSaveInput } from "./evaluation-form-session";

const record = (over: Partial<EvaluationRecord> = {}): EvaluationRecord => ({
  id: 12, evaluatedOn: "2026-09-21", classInstanceId: null, className: null, note: null, editable: true,
  ratings: [], share: null, ...over,
});

/** A server the test answers by hand, so the ORDER of requests and answers is the test's to choose. */
function server() {
  const calls: { input: EvaluationFormSaveInput; resolve: (r: PutEvaluationRecordResult) => void; reject: (e: unknown) => void }[] = [];
  const save = vi.fn(
    (input: EvaluationFormSaveInput) =>
      new Promise<PutEvaluationRecordResult>((resolve, reject) => calls.push({ input, resolve, reject }))
  );
  return { calls, save };
}
const tick = () => Promise.resolve().then(() => Promise.resolve());
const conflict = (code: string, status = 409) => ({ response: { status, data: { error: code } } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("saves are serialised: one request at a time, each reading the record's id AFTER the previous answer", () => {
  it("a tap made while the previous save is in flight waits for it, then carries the id that save returned", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: null, save });
    session.rate("1", 4);
    session.rate("2", 3);
    expect(calls).toHaveLength(1); // the second is queued, not sent
    expect(calls[0].input).toEqual({ ratings: { "1": 4 } });
    calls[0].resolve(record({ id: 40 }));
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1].input).toEqual({ ratings: { "2": 3 }, recordId: 40 });
  });

  it("a mis-tap cleared, then another row rated at once: the second PUT does NOT carry the id of the record the clear just deleted", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: record({ ratings: [{ categoryId: 1, name: "A", key: null, score: 4, scaleMin: 1, scaleMax: 5 }] }), save });
    session.rate("1", null); // clears the only rating: the server deletes record 12
    session.rate("2", 4); // tapped before the answer arrived
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toEqual({ ratings: { "1": null }, recordId: 12 });
    calls[0].resolve({ deleted: true });
    await tick();
    expect(calls[1].input).toEqual({ ratings: { "2": 4 } }); // no recordId: a valid star is not rolled back by a 404
    calls[1].resolve(record({ id: 13 }));
    await tick();
    expect(session.getState().scores).toEqual({ "1": null, "2": 4 });
    expect(session.getState().failure).toBeNull();
  });

  it("set-then-clear of one star is applied in the order it was tapped, whatever the network does", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: null, save });
    session.rate("1", 3);
    session.rate("1", null);
    calls[0].resolve(record({ id: 40 }));
    await tick();
    expect(calls[1].input).toEqual({ ratings: { "1": null }, recordId: 40 });
    calls[1].resolve({ deleted: true });
    await tick();
    expect(session.getState().scores["1"]).toBeNull();
    session.rate("1", 5);
    expect(calls[2].input).toEqual({ ratings: { "1": 5 } });
  });
});

describe("a failed save", () => {
  it("rolls a rating back to what the server last accepted, and says so", async () => {
    const { calls, save } = server();
    const onFailure = vi.fn();
    const session = createEvaluationFormSession({
      record: record({ ratings: [{ categoryId: 1, name: "A", key: null, score: 3, scaleMin: 1, scaleMax: 5 }] }), save, onFailure,
    });
    session.rate("1", 5);
    expect(session.getState().scores["1"]).toBe(5); // optimistic
    calls[0].reject(new Error("offline"));
    await tick();
    expect(session.getState().scores["1"]).toBe(3);
    expect(session.getState().failure).toBe("generic");
    expect(onFailure).toHaveBeenCalledWith("generic");
  });

  it("does not roll back over a newer tap on the same competency", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: null, save });
    session.rate("1", 5);
    session.rate("1", 2);
    calls[0].reject(new Error("offline"));
    await tick();
    expect(session.getState().scores["1"]).toBe(2); // the newer tap is what the coach sees, and it is being saved
    calls[1].resolve(record({ id: 40 }));
    await tick();
    expect(session.getState().scores["1"]).toBe(2);
  });

  it("KEEPS typed note text, marks it unsaved, and saves it on retry", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: record({ note: "Antes." }), save, noteQuietMs: 800 });
    session.editNote("Três frases que o treinador escreveu.");
    vi.advanceTimersByTime(800);
    calls[0].reject(new Error("offline"));
    await tick();
    expect(session.getState().note).toBe("Três frases que o treinador escreveu.");
    expect(session.getState().noteUnsaved).toBe(true);
    session.retryNote();
    expect(calls[1].input).toEqual({ note: "Três frases que o treinador escreveu.", recordId: 12 });
    calls[1].resolve(record({ note: "Três frases que o treinador escreveu." }));
    await tick();
    expect(session.getState().noteUnsaved).toBe(false);
    expect(session.getState().failure).toBeNull();
  });
});

describe("the form left open past midnight (rule 11)", () => {
  it("a 409 record_not_editable is its own failure, the rating rolls back, and nothing further is sent", async () => {
    const { calls, save } = server();
    const onFailure = vi.fn();
    const session = createEvaluationFormSession({ record: record(), save, onFailure });
    session.rate("1", 4);
    calls[0].reject(conflict("record_not_editable"));
    await tick();
    expect(session.getState().failure).toBe("dayPassed");
    expect(session.getState().scores["1"] ?? null).toBeNull();
    expect(onFailure).toHaveBeenCalledWith("dayPassed");
    session.rate("1", 5); // retrying can never succeed: no request, the same answer
    session.editNote("x");
    vi.advanceTimersByTime(5000);
    await tick();
    expect(calls).toHaveLength(1);
    expect(session.getState().scores["1"] ?? null).toBeNull();
    expect(session.getState().failure).toBe("dayPassed");
  });

  it("any other 409 is a generic failure and the form keeps working", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: null, save });
    session.rate("1", 4);
    calls[0].reject(conflict("competency_inactive"));
    await tick();
    expect(session.getState().failure).toBe("generic");
    session.rate("1", 4);
    expect(calls).toHaveLength(2);
  });
});

describe("a stepper's consecutive steps are one input; the note is debounced; flush never loses either", () => {
  it("three steps on one competency are one save after the quiet period; two competencies are two saves", async () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: null, save, stepQuietMs: 400 });
    session.step("2", 6);
    session.step("2", 7);
    session.step("2", 8);
    session.step("3", 5);
    expect(session.getState().scores).toEqual({ "2": 8, "3": 5 }); // shown at once
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(400);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toEqual({ ratings: { "2": 8 } });
    calls[0].resolve(record({ id: 40 }));
    await tick();
    expect(calls[1].input).toEqual({ ratings: { "3": 5 }, recordId: 40 });
  });

  it("flush sends what is pending now, and an untouched form sends nothing", async () => {
    const { calls, save } = server();
    const untouched = createEvaluationFormSession({ record: null, save });
    untouched.flush();
    vi.advanceTimersByTime(5000);
    expect(calls).toHaveLength(0);

    const session = createEvaluationFormSession({ record: null, save });
    session.step("2", 6);
    session.editNote("Boa sessão");
    session.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toEqual({ ratings: { "2": 6 } });
    calls[0].resolve(record({ id: 40 }));
    await tick();
    expect(calls[1].input).toEqual({ note: "Boa sessão", recordId: 40 });
  });

  it("an emptied note is sent as \"\"", () => {
    const { calls, save } = server();
    const session = createEvaluationFormSession({ record: record({ note: "Late to the ball." }), save, noteQuietMs: 800 });
    session.editNote("");
    vi.advanceTimersByTime(800);
    expect(calls[0].input).toEqual({ note: "", recordId: 12 });
  });
});

describe("subscribers", () => {
  it("are told of every change and can leave", () => {
    const { save } = server();
    const session = createEvaluationFormSession({ record: null, save });
    const seen = vi.fn();
    const leave = session.subscribe(seen);
    session.rate("1", 4);
    expect(seen).toHaveBeenCalled();
    const before = seen.mock.calls.length;
    leave();
    session.rate("1", 2);
    expect(seen.mock.calls.length).toBe(before);
  });
});

describe("the row list never drops a row while the form is open (Q33's family)", () => {
  const competency = (id: number, isActive = true) =>
    ({ id, key: null, name: `C${id}`, group: "custom" as const, scaleMin: 1, scaleMax: 5, isActive, sortOrder: null, scoreCount: 0 });

  it("keeps a switched-off competency listed after its rating is cleared, in the place it had", () => {
    const first = [competency(1), competency(12, false), competency(3)];
    const afterClear = [competency(1), competency(3)]; // the refetched record no longer rates 12
    expect(stableFormRows(first, afterClear).map((c) => c.id)).toEqual([1, 12, 3]);
  });

  it("takes fresher data for a row it keeps, and appends a row that is new", () => {
    const renamed = { ...competency(1), name: "Renamed" };
    const rows = stableFormRows([competency(1)], [renamed, competency(7)]);
    expect(rows.map((c) => c.id)).toEqual([1, 7]);
    expect(rows[0].name).toBe("Renamed");
  });
});
