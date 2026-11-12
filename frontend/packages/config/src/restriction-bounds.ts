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

/**
 * PAD-920 (notifications.config rule 20; notifications.engine-settings rule 2): the new engine's own
 * steppers, beside the restrictions'. Minutes start at ENGINE_T_FLOOR (1 minute, ruling D7), not at
 * `maxInactiveTime`'s 15, which still holds for a coach on the old engine.
 */
export const ENGINE_T_FLOOR = 1;

/** The engine's M when the coach has set none (`maxAtATime` null; notifications.engine-settings rule 1). */
export const ENGINE_DEFAULT_MAX_AT_A_TIME = 12;

export type EngineSettingKey = "maxAtATime" | "betweenRoundsMinutes" | "betweenGroupsMinutes";

export const ENGINE_SETTING_BOUNDS: Record<EngineSettingKey, RestrictionBound> = {
  maxAtATime: { min: 1, max: 50, step: 1 },
  betweenRoundsMinutes: { min: ENGINE_T_FLOOR, max: 1440, step: 1 },
  betweenGroupsMinutes: { min: ENGINE_T_FLOOR, max: 1440, step: 1 },
};

export function stepEngineSetting(key: EngineSettingKey, value: number, direction: 1 | -1): number {
  const { min, max, step } = ENGINE_SETTING_BOUNDS[key];
  return Math.min(max, Math.max(min, value + direction * step));
}
