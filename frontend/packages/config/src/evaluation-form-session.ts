import type { EvaluationCompetency, EvaluationRecord, PutEvaluationRecordResult } from "@levelup/types";
import { createDebouncedWriter } from "./evaluation-form";

/**
 * The ONE save module behind "Nova avaliação" on web and iOS (evaluations.records rules
 * 7, 10, 11; evaluations.history rules 4-5). Pure state, no DOM: the shells subscribe and
 * render. Each input is one `PUT`, and the module owns everything the two hand-written
 * forms got wrong (Session-B's review of PAD-374):
 *
 * - Saves are SERIALISED. One request in flight at a time; the next reads the record's id
 *   only after the previous answer, so a tap can never carry the id of a record the server
 *   has just deleted, and set-then-clear is applied in the order it was tapped.
 * - A failed save rolls a RATING back to what the server last accepted — unless a newer
 *   tap on that competency is already what the coach sees. A failed NOTE save keeps the
 *   typed text, marks it unsaved and can be retried: free text is never data to lose.
 * - A 409 `record_not_editable` (the form stayed open past midnight) is its own failure,
 *   `dayPassed`: nothing further is sent, because retrying can never succeed.
 * - A stepper's consecutive steps are one input (`step`, debounced per competency); the
 *   note is debounced; `flush` sends what is pending, on blur, close and unmount.
 */

export type EvaluationFormSaveInput = { ratings?: Record<string, number | null>; note?: string; recordId?: number };
export type EvaluationFormFailure = "generic" | "dayPassed";

export interface EvaluationFormState {
  scores: Record<string, number | null>;
  note: string;
  /** The last note save failed: the text is the coach's, still unsaved, and can be retried. */
  noteUnsaved: boolean;
  failure: EvaluationFormFailure | null;
}

export interface EvaluationFormSessionOptions {
  /** The record the form opens on (today's), or null. */
  record: EvaluationRecord | null;
  /** One `PUT`. Rejects on failure; a 409 is read from `error.response.data.error`. */
  save: (input: EvaluationFormSaveInput) => Promise<PutEvaluationRecordResult>;
  /** Told once per failed request, for a toast. */
  onFailure?: (failure: EvaluationFormFailure) => void;
  stepQuietMs?: number;
  noteQuietMs?: number;
}

export interface EvaluationFormSession {
  getState(): EvaluationFormState;
  subscribe(listener: () => void): () => void;
  /** A star tap: saved at once. `null` clears. */
  rate(key: string, value: number | null): void;
  /** A stepper press: shown at once, saved after the quiet period as one input. */
  step(key: string, value: number | null): void;
  editNote(text: string): void;
  retryNote(): void;
  /** Send what is pending now — blur, "Concluir avaliação", close, unmount. */
  flush(): void;
}

type Job = { input: EvaluationFormSaveInput; rollback: () => void; commit: () => void };

function conflictCode(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } } | null)?.response;
  return response?.status === 409 && typeof response.data?.error === "string" ? response.data.error : null;
}

export function createEvaluationFormSession(options: EvaluationFormSessionOptions): EvaluationFormSession {
  const listeners = new Set<() => void>();
  const opened: Record<string, number | null> = {};
  for (const rating of options.record?.ratings ?? []) opened[String(rating.categoryId)] = rating.score;
  let state: EvaluationFormState = { scores: { ...opened }, note: options.record?.note ?? "", noteUnsaved: false, failure: null };
  // What the server last APPLIED, in the order it applied it — the rollback target.
  const accepted = { scores: { ...opened }, note: state.note, recordId: options.record?.id as number | undefined };
  let dayPassed = false;

  const set = (next: Partial<EvaluationFormState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  // The queue: one request in flight; each job reads `accepted.recordId` when it is SENT.
  const queue: Job[] = [];
  let inFlight = false;
  const pump = async () => {
    if (inFlight) return;
    const job = queue.shift();
    if (!job) return;
    inFlight = true;
    try {
      const { recordId } = accepted;
      const result = await options.save(recordId === undefined ? job.input : { ...job.input, recordId });
      accepted.recordId = "deleted" in result ? undefined : result.id;
      job.commit();
      set({ failure: null });
    } catch (error) {
      job.rollback();
      const failure: EvaluationFormFailure = conflictCode(error) === "record_not_editable" ? "dayPassed" : "generic";
      if (failure === "dayPassed") {
        dayPassed = true;
        queue.length = 0; // retrying can never succeed
      }
      set({ failure });
      options.onFailure?.(failure);
    } finally {
      inFlight = false;
      void pump();
    }
  };
  const enqueue = (job: Job) => {
    if (dayPassed) return;
    queue.push(job);
    void pump();
  };

  const saveScore = (key: string, value: number | null) =>
    enqueue({
      input: { ratings: { [key]: value } },
      // Roll back only if this value is still what is shown: a newer tap is its own save.
      rollback: () => { if (state.scores[key] === value) set({ scores: { ...state.scores, [key]: accepted.scores[key] ?? null } }); },
      commit: () => { accepted.scores[key] = value; },
    });

  const saveNote = (text: string) =>
    enqueue({
      input: { note: text },
      rollback: () => { if (state.note === text) set({ noteUnsaved: true }); },
      commit: () => { accepted.note = text; if (state.note === text) set({ noteUnsaved: false }); },
    });

  const steps = createDebouncedWriter<number | null>((key, value) => saveScore(key, value), options.stepQuietMs ?? 400);
  const notes = createDebouncedWriter<string>((_key, text) => saveNote(text), options.noteQuietMs ?? 800);

  const show = (key: string, value: number | null) => {
    if (dayPassed) return false;
    set({ scores: { ...state.scores, [key]: value } });
    return true;
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    rate: (key, value) => { if (show(key, value)) saveScore(key, value); },
    step: (key, value) => { if (show(key, value)) steps.schedule(key, value); },
    editNote: (text) => {
      if (dayPassed) return;
      set({ note: text });
      notes.schedule("note", text);
    },
    retryNote: () => { if (state.noteUnsaved) saveNote(state.note); },
    flush: () => { steps.flush(); notes.flush(); },
  };
}

/**
 * The rows a form shows while it is open (Q33's family): a row that was listed stays listed
 * in its place — clearing the rating of a switched-off competency must not make the rows
 * below jump up under the coach's finger — with the freshest data for it; a new row joins
 * at the end.
 */
export function stableFormRows(previous: EvaluationCompetency[], current: EvaluationCompetency[]): EvaluationCompetency[] {
  const fresh = new Map(current.map((competency) => [competency.id, competency]));
  const kept = previous.map((competency) => fresh.get(competency.id) ?? competency);
  const known = new Set(previous.map((competency) => competency.id));
  return [...kept, ...current.filter((competency) => !known.has(competency.id))];
}
