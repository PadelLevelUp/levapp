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

export type ClassEvaluationsActionState = "hidden" | "loading" | "error" | "unavailable" | "available";

/**
 * Whether the class detail offers "Avaliações" (rules 1, 10). Hidden for a student, for
 * an event that is not a class, and when the read was REFUSED — a 403, the coach does
 * not own the class — whatever was held before. Any other failure is `error`: its own
 * state with a retry, never "not the owner" (a 502 during a deploy, a dropped
 * connection). A failure while the last good read is still held changes nothing — the
 * panel stays mounted on that data, so a failed post-write refetch never unmounts an
 * open panel mid-edit. Otherwise it follows the read's `canRate`: a past occurrence
 * that was never opened is `unavailable` — shown disabled with a one-line explanation,
 * because rating it would have to materialise a class that is over.
 */
export function classEvaluationsAction(input: {
  isCoach: boolean;
  isClass: boolean;
  data: ClassEvaluations | undefined;
  isError: boolean;
  /** The failed read's HTTP status, when it had one. */
  errorStatus?: number;
}): ClassEvaluationsActionState {
  if (!input.isCoach || !input.isClass) return "hidden";
  if (input.isError && input.errorStatus === 403) return "hidden";
  if (input.data) return input.data.canRate ? "available" : "unavailable";
  return input.isError ? "error" : "loading";
}

/** The HTTP status of a failed request, when the error carries one (axios shape). */
export function errorStatusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" ? status : undefined;
}
