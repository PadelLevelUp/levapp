import type { EvaluationCompetency, EvaluationRecord } from "@levelup/types";

// The evaluation form's rules, shared by web and iOS (PAD-374; evaluations.history
// rules 4-5, evaluations.records rules 7 and 10). Nothing here computes a figure or
// compares a date: "today", `editable`, means and deltas are the server's (R-048).

/** A 1-5 scale is drawn as stars. Since PAD-403 (evaluations.legacy-conversion rule 5)
 *  every category is 1-5, legacy ones included, so every rating is stars. The number
 *  with a stepper remains only for a scale that is not 1-5, which the server no longer
 *  holds. It is dormant, kept so that a row the migration has not reached yet (the
 *  deploy window) never draws an 8 as stars. */
export function isStarScale(scale: Pick<EvaluationCompetency, "scaleMin" | "scaleMax">): boolean {
  return scale.scaleMin === 1 && scale.scaleMax === 5;
}

/** Which input rates a competency (evaluations.scale rule 7, PAD-423): the five stars on 1-5; a
 *  slider on the coach's 1-10, 1-20 or 1-100 (catalogue and custom competencies); the dormant
 *  stepper only for a LEGACY category (`group` null) that is somehow not 1-5 (see `isStarScale`). */
export type RatingInputKind = "stars" | "slider" | "stepper";

export function ratingInputKind(competency: Pick<EvaluationCompetency, "scaleMin" | "scaleMax" | "group">): RatingInputKind {
  if (isStarScale(competency)) return "stars";
  return competency.group === null ? "stepper" : "slider";
}

/** A competency in the form: stars when its scale is 1-5 (see `isStarScale`). */
export function isStarCompetency(competency: Pick<EvaluationCompetency, "scaleMin" | "scaleMax">): boolean {
  return isStarScale(competency);
}

/** What "Nova avaliação" lists: the active competencies plus any switched-off one
 *  already rated in the record being edited — in the order the server sent them. */
export function formCompetencies(
  competencies: EvaluationCompetency[],
  record: Pick<EvaluationRecord, "ratings"> | null
): EvaluationCompetency[] {
  const rated = new Set((record?.ratings ?? []).map((rating) => rating.categoryId));
  return competencies.filter((competency) => competency.isActive || rated.has(competency.id));
}

/** Today's class-less record, if there is one. The server's `editable` says which day is today. */
export function todaysClasslessRecord(records: EvaluationRecord[]): EvaluationRecord | null {
  return records.find((record) => record.editable && record.classInstanceId === null) ?? null;
}

/** A star tap: tapping the lit star clears the rating (`null` is what the API clears with). */
export function nextStarScore(current: number | null, tapped: number): number | null {
  return current === tapped ? null : tapped;
}

/** A stepper press. An unrated category starts at the middle of its scale — a starting
 *  position the coach then moves — and every later press steps within the scale. */
export function stepScore(current: number | null, delta: 1 | -1, scaleMin: number, scaleMax: number): number {
  // R-048's grep check hits this Math.round BY DESIGN: it is a starting POSITION for the control (the
  // middle of the scale), not an evaluation figure. No mean, delta or window is ever computed here.
  if (current === null) return Math.round((scaleMin + scaleMax) / 2);
  return Math.min(scaleMax, Math.max(scaleMin, current + delta));
}

export interface DebouncedWriter<V> {
  /** Replace whatever is pending for `key` and restart its quiet period. */
  schedule(key: string, value: V): void;
  /** Write what is pending now — for one key, or for all. Call it on blur, on
   *  "Concluir avaliação", on close and on unmount: a quick step-then-close is never lost. */
  flush(key?: string): void;
  pending(): boolean;
}

/** "Each input saves as it is made; a stepper's consecutive steps are one input."
 *  Debounced PER KEY, so stepping A and then B inside the window writes both. */
export function createDebouncedWriter<V>(write: (key: string, value: V) => void, delayMs = 400): DebouncedWriter<V> {
  const waiting = new Map<string, { value: V; timer: ReturnType<typeof setTimeout> }>();

  const fire = (key: string) => {
    const entry = waiting.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    waiting.delete(key);
    write(key, entry.value);
  };

  return {
    schedule(key, value) {
      const previous = waiting.get(key);
      if (previous) clearTimeout(previous.timer);
      waiting.set(key, { value, timer: setTimeout(() => fire(key), delayMs) });
    },
    flush(key) {
      if (key !== undefined) return fire(key);
      for (const pendingKey of [...waiting.keys()]) fire(pendingKey);
    },
    pending: () => waiting.size > 0,
  };
}

/**
 * Where "Gerir competências" opens today (PAD-374): the Settings page that holds
 * the category editor. PAD-373 builds the real competency manager and changes
 * ONLY this constant (or the two `openCompetencyManager` functions that read it:
 * `apps/web/src/components/evaluations/openCompetencyManager.ts` and
 * `apps/mobile/src/features/evaluations/open-competency-manager.ts`). Every entry
 * point — the evaluation form's empty state here, the class panel in slice 6 —
 * calls that function and nothing else.
 */
export const COMPETENCY_MANAGER_ROUTE = { web: "?competencies=open", mobile: "/competencies" } as const;

/** A competency's label: catalogue ones are translated by `key` (en + pt in
 *  `locales/<lng>/evaluations.json`), custom and legacy ones are shown as typed. */
export function competencyLabel(
  t: (key: string, options?: { defaultValue?: string }) => string,
  competency: { key: string | null; name: string }
): string {
  return competency.key ? t(`evaluations.catalogue.${competency.key}`, { defaultValue: competency.name }) : competency.name;
}
