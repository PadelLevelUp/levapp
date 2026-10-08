/**
 * PAD-527 (classes.create rule 10, classes.edit rule 9): how a student's level reads against the
 * class's level in the participant picker, on web and iOS alike.
 * - "same": the class has a level and the student has it → the level chip in the primary colour.
 * - "other": the class has a level and the student has another one, or none → the amber chip
 *   (the "outside the class's level" mark; "No level" when the student has none).
 * - "none": the class has no level → a neutral chip with the student's level, if any.
 * The level is visible in every case where the student has one. Ids are compared as strings.
 */
export type ClassLevelMatch = "same" | "other" | "none";

export function classLevelMatch(
  playerLevelId: string | number | null | undefined,
  classLevelId: string | number | null | undefined
): ClassLevelMatch {
  if (classLevelId === null || classLevelId === undefined || classLevelId === "") return "none";
  if (playerLevelId === null || playerLevelId === undefined || playerLevelId === "") return "other";
  return String(playerLevelId) === String(classLevelId) ? "same" : "other";
}
