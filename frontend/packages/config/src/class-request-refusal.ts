/**
 * classes.class-requests rule 4a (B-729): an accept refused because someone is going to another class
 * at the same hour (`409 busy_same_hour`, instance-enrollment rule 15) reads one line per clash. The
 * coach gets rule 15's own line, which tells them to remove the student from the other class; the
 * student gets the same facts without that instruction. Null for any other failure, so the screen keeps
 * its own refusal text.
 */
import { busySameHourClashes, busySameHourLines } from "./busy-same-hour-copy";
import type { I18nText } from "./invite-simulation";

const STUDENT_LINE = "classRequests.busySameHour.studentLine";

export function classRequestRefusalLines(
  err: unknown,
  role: "coach" | "student",
  language: string | undefined
): I18nText[] | null {
  const clashes = busySameHourClashes(err);
  if (!clashes || clashes.length === 0) return null;
  const lines = busySameHourLines(clashes, language);
  return role === "coach" ? lines : lines.map((line) => ({ ...line, key: STUDENT_LINE }));
}
