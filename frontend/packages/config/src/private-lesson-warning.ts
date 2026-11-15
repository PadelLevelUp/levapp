/**
 * PAD-929 (`classes.join-requests` rule 22): whether a student's join on a lesson asks the
 * private-lesson warning first, and the warning's keys. Both shells ask here, so the sheet, the
 * no-free-time list and any later surface cannot disagree on who is asked.
 *
 * Asked: a request or a waiting-list join on a lesson of type `private`. Not asked: a waiting-list
 * join by a student invited to that class or who gave up their place in it (`invited`,
 * `not_coming`), which the server exempts; an academy class; a lesson whose type is unknown.
 */
export const PRIVATE_LESSON_WARNING_KEYS = {
  body: "calendar.privateLessonWarning.body",
  yes: "calendar.privateLessonWarning.yes",
  no: "calendar.privateLessonWarning.no",
} as const;

export type PrivateJoinAction = "request" | "waitlist";

const WAITLIST_EXEMPT = new Set(["invited", "not_coming"]);

export function needsPrivateLessonWarning(
  lesson: { classType?: string | null; studentRelation?: string | null },
  action: PrivateJoinAction,
): boolean {
  if (lesson.classType !== "private") return false;
  return !(action === "waitlist" && WAITLIST_EXEMPT.has(lesson.studentRelation ?? ""));
}
