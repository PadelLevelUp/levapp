import type { GroupRule } from "@levelup/types";

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
 * The transitions below live here rather than in the screen so the mobile unit
 * runner can pin them: they are the part with real rules, and getting one
 * wrong leaves a stale value silently attached to a rule that has no value.
 */

export type EligibilityValueType = "number" | "percentage" | "conditional-number";

export type EligibilityAttribute = {
  id: string;
  labelKey: string;
  operations: { id: string; labelKey: string }[];
  valueType: EligibilityValueType;
  /** For `conditional-number`: the operations that actually carry a value. */
  valueForOperations?: string[];
};

export const ELIGIBILITY_ATTRIBUTES: EligibilityAttribute[] = [
  {
    id: "level",
    labelKey: "settings.eligibility.attributes.level",
    operations: [
      { id: "same_as_class", labelKey: "settings.eligibility.operations.sameAsClass" },
      {
        id: "equal_or_above_class",
        labelKey: "settings.eligibility.operations.equalOrAboveClass",
      },
      {
        id: "equal_or_below_class",
        labelKey: "settings.eligibility.operations.equalOrBelowClass",
      },
      {
        id: "one_below_or_above_class",
        labelKey: "settings.eligibility.operations.oneBelowOrAboveClass",
      },
      {
        id: "within_n_of_class",
        labelKey: "settings.eligibility.operations.withinNOfClass",
      },
    ],
    // `within_n_of_class` is the only level operation that carries a value.
    valueType: "conditional-number",
    valueForOperations: ["within_n_of_class"],
  },
  {
    id: "unjustified_absences",
    labelKey: "settings.eligibility.attributes.unjustifiedAbsences",
    operations: [
      { id: "less_than", labelKey: "settings.eligibility.operations.lessThan" },
      { id: "equals", labelKey: "settings.eligibility.operations.equals" },
      { id: "less_than_or_equal", labelKey: "settings.eligibility.operations.atMost" },
    ],
    valueType: "number",
  },
  {
    id: "justified_absences",
    labelKey: "settings.eligibility.attributes.justifiedAbsences",
    operations: [
      { id: "less_than", labelKey: "settings.eligibility.operations.lessThan" },
      { id: "equals", labelKey: "settings.eligibility.operations.equals" },
      { id: "less_than_or_equal", labelKey: "settings.eligibility.operations.atMost" },
    ],
    valueType: "number",
  },
  {
    id: "attendance_rate",
    labelKey: "settings.eligibility.attributes.attendanceRate",
    operations: [
      { id: "greater_than", labelKey: "settings.eligibility.operations.greaterThan" },
      {
        id: "greater_than_or_equal",
        labelKey: "settings.eligibility.operations.atLeast",
      },
    ],
    valueType: "percentage",
  },
];

export function findAttribute(id: string): EligibilityAttribute | undefined {
  return ELIGIBILITY_ATTRIBUTES.find((a) => a.id === id);
}

/** Does this attribute/operation pair take a numeric value? */
export function needsValue(
  attr: EligibilityAttribute,
  operation: string
): boolean {
  if (attr.valueType === "number" || attr.valueType === "percentage") return true;
  if (attr.valueType === "conditional-number") {
    return (attr.valueForOperations ?? []).includes(operation);
  }
  return false;
}

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
export function withOperation(rule: GroupRule, operation: string): GroupRule {
  const attr = findAttribute(rule.attribute);
  return {
    ...rule,
    operation,
    value: attr && needsValue(attr, operation) ? rule.value : undefined,
  };
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
