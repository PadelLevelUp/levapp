/**
 * classes.academy-class-booking (PAD-358): what the "Marcar Aula" wizard's academy
 * step shows for each class, decided once so web and iOS cannot disagree.
 */

/** Same limit the server enforces on a join request's note (rule 9). */
export const NOTE_MAX_LENGTH = 500;

export type AcademyClassState = "open" | "full";

export type AcademyClassAction = "request" | "join_waitlist" | "requested" | "on_waitlist";

export interface AcademyClassLike {
  id: string;
  date: string;
  startTime: string;
  state: AcademyClassState;
  spotsLeft: number;
  myJoinRequest: { id: number; status: string } | null;
  onWaitingList: boolean;
}

/**
 * Rule 7: a class the student already acted on shows that status instead of an
 * action. Only a *pending* request counts — a rejected, withdrawn or superseded
 * one may be asked again, as the join-request endpoint allows.
 */
export function academyClassAction(c: AcademyClassLike): AcademyClassAction {
  if (c.myJoinRequest?.status === "pending") return "requested";
  if (c.onWaitingList) return "on_waitlist";
  return c.state === "full" ? "join_waitlist" : "request";
}

export interface AcademyClassDay<T extends AcademyClassLike> {
  date: string;
  classes: T[];
}

/** Rule 10: grouped by day, days and classes in time order. */
export function groupAcademyClassesByDay<T extends AcademyClassLike>(classes: T[]): AcademyClassDay<T>[] {
  const byDate = new Map<string, T[]>();
  for (const c of [...classes].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))) {
    const list = byDate.get(c.date) ?? [];
    list.push(c);
    byDate.set(c.date, list);
  }
  return [...byDate.entries()].map(([date, list]) => ({ date, classes: list }));
}
