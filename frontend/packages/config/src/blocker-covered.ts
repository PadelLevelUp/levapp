/**
 * calendar.student-blockers rules 19–21 (PAD-772, owner correction 26 Nov 2026: nothing is asked): a saved
 * availability block marks the classes it covers "Não vai" on the server, and the answer lists them
 * (`markedClasses`, additive: an old server sends none). This is the one decision web and iOS share about what
 * a save then shows: a count line and a re-read when something was marked, nothing otherwise.
 */
import type { MarkedClass } from "@levelup/types";

export type { MarkedClass };

/** The classes a save's answer says it marked: none for an old server, an empty list or anything malformed. */
export function markedClassesOf(answer: { markedClasses?: unknown } | null | undefined): MarkedClass[] {
  const list = answer?.markedClasses;
  return Array.isArray(list) ? (list as MarkedClass[]) : [];
}

export type SaveFollowUp = {
  /** How many classes the save marked: the count the toast shows (`availability.covered.marked_*`). */
  marked: number;
  /** The student's calendar, class screens and dashboard are read again. */
  refresh: boolean;
};

/** What follows a block save (rule 21). Never a question: there is nothing to answer. */
export function followUpOfSave(answer: { markedClasses?: unknown } | null | undefined): SaveFollowUp {
  const marked = markedClassesOf(answer).length;
  return { marked, refresh: marked > 0 };
}
