import type { GroupRule } from "@levelup/types";

/**
 * PAD-129 (eligibility.cascade rules 2, 8, 9) — the class sheet's three-way
 * eligibility control, shared by both shells.
 *
 * The tier value is a tri-state on the wire: `null` = no override at this
 * tier (fall through to the tier below), `[]` = a deliberate "everyone", a
 * list = that bar. The control exposes it as a mode plus the rules to edit.
 */
export type EligibilityTierMode = "standard" | "everyone" | "custom";

export function tierMode(rules: GroupRule[] | null | undefined): EligibilityTierMode {
  if (rules == null) return "standard";
  return rules.length === 0 ? "everyone" : "custom";
}

/**
 * The tier value for a chosen mode. Switching to "custom" keeps whatever rules
 * were there (or seeds the effective bar, so the coach edits from what
 * currently applies rather than from nothing).
 */
export function tierValueFor(
  mode: EligibilityTierMode,
  current: GroupRule[] | null | undefined,
  effective: GroupRule[] | null | undefined
): GroupRule[] | null {
  if (mode === "standard") return null;
  if (mode === "everyone") return [];
  if (current && current.length > 0) return current;
  return effective && effective.length > 0 ? [...effective] : [];
}
