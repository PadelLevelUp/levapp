import type { ClassEvaluations, EvaluationCompetency, EvaluationRecord } from "@levelup/types";

// evaluations.class-panel (PAD-376): the rules both shells share. The server decides
// who is listed, in what order, which record a row shows and whether the occurrence
// can be rated at all (`canRate`) — nothing here compares a date with the device's clock.

type Rated = Pick<EvaluationRecord, "ratings"> | null;

/**
 * What a participant's row lists (rule 5, Q26): the coach's active competencies, then
 * any competency the row's record already rates that is not active — so a rating is
 * never hidden behind a switch. The class read sends active competencies only, so the
 * others come from `known`, the coach's whole set (stars stay stars, a legacy scale
 * stays a number). One the set does not know is still listed, from the rating itself,
 * as a number: never dropped and never guessed into stars.
 */
export function classRowCompetencies(
  active: EvaluationCompetency[],
  record: Rated,
  known: EvaluationCompetency[]
): EvaluationCompetency[] {
  const listed = new Set(active.map((competency) => competency.id));
  const extra = (record?.ratings ?? [])
    .filter((rating) => !listed.has(rating.categoryId))
    .map(
      (rating): EvaluationCompetency =>
        known.find((competency) => competency.id === rating.categoryId) ?? {
          id: rating.categoryId,
          key: rating.key,
          name: rating.name,
          group: null,
          scaleMin: rating.scaleMin,
          scaleMax: rating.scaleMax,
          isActive: false,
          sortOrder: null,
          scoreCount: 1,
        }
    );
  return [...active, ...extra];
}

/**
 * "N/M avaliadas" (rule 5, AV-070). `total` is the size of the row's list and `rated`
 * how many of them the row's record rates; `rated === 0` reads "Sem avaliação". A
 * record holding only a note rates nothing. Counting rows is presentation — every
 * evaluation FIGURE (a mean, a delta) stays the server's (R-048).
 */
export function classRowSummary(active: EvaluationCompetency[], record: Rated): { rated: number; total: number } {
  const ratings = record?.ratings ?? [];
  const activeIds = new Set(active.map((competency) => competency.id));
  const extra = ratings.filter((rating) => !activeIds.has(rating.categoryId)).length;
  return { rated: ratings.length, total: active.length + extra };
}

export type ClassEvaluationsActionState = "hidden" | "loading" | "unavailable" | "available";

/**
 * Whether the class detail offers "Avaliações" (rules 1, 10). Hidden for a student, for
 * an event that is not a class, and when the read was refused (the coach does not own
 * the class). Otherwise it waits for the read and follows its `canRate`: a past
 * occurrence that was never opened is `unavailable` — shown disabled with a one-line
 * explanation, because rating it would have to materialise a class that is over.
 */
export function classEvaluationsAction(input: {
  isCoach: boolean;
  isClass: boolean;
  data: ClassEvaluations | undefined;
  isError: boolean;
}): ClassEvaluationsActionState {
  if (!input.isCoach || !input.isClass || input.isError) return "hidden";
  if (!input.data) return "loading";
  return input.data.canRate ? "available" : "unavailable";
}
