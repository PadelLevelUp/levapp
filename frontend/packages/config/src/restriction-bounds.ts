/**
 * notifications.config rule 14 (PAD-433): the restriction steppers' bounds and steps, in ONE
 * place. Web's RestrictionsPanel and the iOS restrictions section both read these, so the two
 * clients cannot offer different ranges for the same setting.
 */
export type SteppedRestrictionKey =
  | "maxSimultaneous"
  | "maxTotal"
  | "maxInactiveTime"
  | "minTimeBeforeClass"
  | "maxInvitesPerStudentPerDay"
  | "cancellationDeadlineHours";

export interface RestrictionBound {
  min: number;
  max: number;
  step: number;
}

export const RESTRICTION_BOUNDS: Record<SteppedRestrictionKey, RestrictionBound> = {
  maxSimultaneous: { min: 1, max: 20, step: 1 },
  maxTotal: { min: 1, max: 50, step: 1 },
  maxInactiveTime: { min: 15, max: 1440, step: 15 }, // minutes
  minTimeBeforeClass: { min: 5, max: 240, step: 5 }, // minutes
  maxInvitesPerStudentPerDay: { min: 1, max: 10, step: 1 },
  cancellationDeadlineHours: { min: 0, max: 168, step: 1 }, // hours
};

/** One press of + (1) or − (-1), clamped to the key's bounds. */
export function stepRestriction(key: SteppedRestrictionKey, value: number, direction: 1 | -1): number {
  const { min, max, step } = RESTRICTION_BOUNDS[key];
  return Math.min(max, Math.max(min, value + direction * step));
}

/** Whether + (1) or − (-1) can still move the value; false at the bound, so the button disables. */
export function canStepRestriction(key: SteppedRestrictionKey, value: number, direction: 1 | -1): boolean {
  const { min, max } = RESTRICTION_BOUNDS[key];
  return direction > 0 ? value < max : value > min;
}
