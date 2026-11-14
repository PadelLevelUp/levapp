import type { GroupRule } from "@levelup/types";
import {
  ELIGIBILITY_ATTRIBUTES,
  eligibilityNeedsValue as needsValue,
  findEligibilityAttribute as findAttribute,
  operationForMenuPick,
  withinNOperation,
  type WithinNDirection,
} from "@levelup/config";

/**
 * The coach's standard eligibility bar (PAD-128, ported to iOS by PAD-161).
 *
 * Mirrors web's `EligibilitySection.tsx`. The attribute list is deliberately
 * NOT the invitation-group one:
 *
 *  - **no side.** Side stays a wave criterion inside the invitation engine — it
 *    decides who is asked first, never who is allowed in (`eligibility.rules`
 *    rule 4).
 *  - **no payments/subscription.** No payment state exists to read
 *    (`eligibility.rules` rule 5).
 *  - **level operations are anchored to the CLASS**, not to a vacancy, because
 *    the bar must be answerable for a class with no spot open.
 *
 * The attribute table lives in `@levelup/config` (rule-values), shared with web.
 * The transitions below live here rather than in the screen so the mobile unit
 * runner can pin them: they are the part with real rules, and getting one
 * wrong leaves a stale value silently attached to a rule that has no value.
 */

// The table and "needs a value" moved to `@levelup/config` (eligibility.rules rule 13), one copy for
// both apps; re-exported under the names this file has always had.
export {
  ELIGIBILITY_ATTRIBUTES,
  eligibilityNeedsValue as needsValue,
  findEligibilityAttribute as findAttribute,
  type EligibilityAttribute,
  type EligibilityValueType,
} from "@levelup/config";

/** A brand-new rule: first attribute, its first operation, no value. */
export function newRule(): GroupRule {
  const attr = ELIGIBILITY_ATTRIBUTES[0];
  return { attribute: attr.id, operation: attr.operations[0].id };
}

/**
 * Switch a rule to another attribute.
 *
 * The operation must reset — operations are per-attribute, so keeping the old
 * one would leave e.g. `attendance_rate greater_than` paired with `level`. The
 * value is dropped for the same reason.
 */
export function withAttribute(attribute: string): GroupRule {
  const attr = findAttribute(attribute);
  return {
    attribute,
    operation: attr?.operations[0].id ?? "",
    value: undefined,
  };
}

/**
 * Switch a rule to another operation, dropping a now-meaningless value.
 *
 * Without this, moving `level within_n_of_class 2` to `same_as_class` would
 * keep the 2 attached to an operation that has no value.
 */
export function withOperation(rule: GroupRule, picked: string): GroupRule {
  const attr = findAttribute(rule.attribute);
  // PAD-481: picking "within N levels" on a rule that already is one keeps its direction.
  const operation = operationForMenuPick(rule.operation, picked);
  return {
    ...rule,
    operation,
    value: attr && needsValue(attr, operation) ? rule.value : undefined,
  };
}

/** PAD-481: set the direction of a "within N levels" rule; N is kept. */
export function withDirection(rule: GroupRule, direction: WithinNDirection): GroupRule {
  return { ...rule, operation: withinNOperation(direction) };
}

/**
 * Remove one rule.
 *
 * Clearing the last rule returns the bar to "unset" (`null`) rather than an
 * empty array: at the coach tier the two are equivalent, and `null` is the
 * honest representation of "I have not defined a bar".
 */
export function removeRuleAt(
  rules: GroupRule[],
  index: number
): GroupRule[] | null {
  const next = rules.filter((_, i) => i !== index);
  return next.length === 0 ? null : next;
}
