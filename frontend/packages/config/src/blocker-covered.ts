/**
 * calendar.student-blockers rules 19–22 (PAD-772): the classes a saved availability block covers, and the one
 * decision web and iOS share about what to do with a save's answer. The server lists the student's own
 * covered occurrences (`coveredClasses`, additive: an old server sends none); the shell asks once, and only a
 * yes marks them "Não vai" through `POST /app/availability_blockers/decline_covered`.
 */
import type { CoveredClass, DeclineCoveredBody, DeclineCoveredResult } from "@levelup/types";

export type { CoveredClass, DeclineCoveredBody, DeclineCoveredResult };

/** The covered classes of a save's answer: none for an old server, an empty list or anything malformed. */
export function coveredClassesOf(answer: { coveredClasses?: unknown } | null | undefined): CoveredClass[] {
  const list = answer?.coveredClasses;
  return Array.isArray(list) ? (list as CoveredClass[]) : [];
}

/** The body of the mark: exactly the `(model, originalId, date)` of each listed class, nothing else. */
export function declineCoveredBody(classes: readonly CoveredClass[]): DeclineCoveredBody {
  return { occurrences: classes.map(({ model, originalId, date }) => ({ model, originalId, date })) };
}

export type CoveredFollowUp = {
  /** The dialog was shown. */
  asked: boolean;
  /** How many classes the server declined (0 for keep, for no question and for a failed mark). */
  marked: number;
  /** The mark failed: the shell says so; the block itself is saved all the same. */
  failed: boolean;
};

/**
 * What follows a block save (rule 21). No classes: nothing is asked. Otherwise `ask` shows the dialog once
 * with every class, in the server's order, and answers "yes" or "keep"; only yes calls `mark`. A mark that
 * throws is reported as `failed`, never rethrown: the block is already saved.
 */
export async function decideCoveredFollowUp(
  answer: { coveredClasses?: unknown } | null | undefined,
  ask: (classes: CoveredClass[]) => Promise<"yes" | "keep">,
  mark: (body: DeclineCoveredBody) => Promise<DeclineCoveredResult>
): Promise<CoveredFollowUp> {
  const classes = coveredClassesOf(answer);
  if (classes.length === 0) return { asked: false, marked: 0, failed: false };
  if ((await ask(classes)) !== "yes") return { asked: true, marked: 0, failed: false };
  try {
    const result = await mark(declineCoveredBody(classes));
    return { asked: true, marked: result.declined.length, failed: false };
  } catch {
    return { asked: true, marked: 0, failed: true };
  }
}
