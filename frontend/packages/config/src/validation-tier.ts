/**
 * PAD-443 — attendance.validation rule 23: how loudly a surface shows the number of classes still
 * to validate. The Presences badge (web sidebar, iOS tab bar) and the dashboard's validation card
 * both take their tier from here, so the two shells cannot disagree on where "yellow" ends.
 *
 * `none` renders nothing, `attention` is yellow, `urgent` is red. Every surface also shows the
 * number itself, so the colour is never the only signal.
 */
export type ValidationTier = "none" | "attention" | "urgent";

/** The most classes that still read as `attention`; one more is `urgent`. */
export const VALIDATION_ATTENTION_MAX = 5;

export function validationTier(count: number): ValidationTier {
  if (!Number.isFinite(count) || count <= 0) return "none";
  return count <= VALIDATION_ATTENTION_MAX ? "attention" : "urgent";
}
