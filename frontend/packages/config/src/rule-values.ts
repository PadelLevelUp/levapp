// eligibility.rules rule 13 (engine stream, blank rules): whether a rule needs a value and whether it
// is missing, one answer for the web and iOS editors, their rows and their Saves. The bar's attribute
// table lives here too (it used to be one copy in each app); the groups' is `TIER_ATTRIBUTES`.
import type { GroupRule, InvitationGroup } from "@levelup/types";
import { TIER_ATTRIBUTES } from "./invitation-tiers";
import { isWithinNOperation } from "./level-direction";

export type EligibilityValueType = "number" | "percentage" | "conditional-number";

export type EligibilityAttribute = {
  id: string;
  labelKey: string;
  operations: { id: string; labelKey: string }[];
  valueType: EligibilityValueType;
};

/**
 * The coach's eligibility bar (PAD-128). Not the invitation groups' list: no side (a wave criterion,
 * never who is allowed in, `eligibility.rules` rule 4), no account status (rule 5), and level
 * operations anchored to the class, so the bar is answerable with no spot open.
 */
export const ELIGIBILITY_ATTRIBUTES: EligibilityAttribute[] = [
  {
    id: "level",
    labelKey: "settings.eligibility.attributes.level",
    operations: [
      { id: "same_as_class", labelKey: "settings.eligibility.operations.sameAsClass" },
      { id: "equal_or_above_class", labelKey: "settings.eligibility.operations.equalOrAboveClass" },
      { id: "equal_or_below_class", labelKey: "settings.eligibility.operations.equalOrBelowClass" },
      { id: "one_below_or_above_class", labelKey: "settings.eligibility.operations.oneBelowOrAboveClass" },
      { id: "within_n_of_class", labelKey: "settings.eligibility.operations.withinNOfClass" },
    ],
    // Only the three `within_n_*` operations carry a value (PAD-481: the direction is the operation).
    valueType: "conditional-number",
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
      { id: "greater_than_or_equal", labelKey: "settings.eligibility.operations.atLeast" },
    ],
    valueType: "percentage",
  },
];

export function findEligibilityAttribute(id: string): EligibilityAttribute | undefined {
  return ELIGIBILITY_ATTRIBUTES.find((a) => a.id === id);
}

/** Does this bar attribute/operation pair take a value? */
export function eligibilityNeedsValue(attr: EligibilityAttribute, operation: string): boolean {
  if (attr.valueType === "number" || attr.valueType === "percentage") return true;
  return isWithinNOperation(operation);
}

/** Which list a rule belongs to: the eligibility bar, or an invitation group. */
export type RuleList = "bar" | "groups";

/** Rule 13: does this rule need a value? An attribute its list does not offer needs none. */
export function ruleNeedsValue(rule: Pick<GroupRule, "attribute" | "operation">, list: RuleList): boolean {
  if (list === "bar") {
    const attr = findEligibilityAttribute(rule.attribute);
    return attr ? eligibilityNeedsValue(attr, rule.operation) : false;
  }
  const attr = TIER_ATTRIBUTES.find((a) => a.id === rule.attribute);
  return attr ? attr.valueType !== "none" : false;
}

/**
 * Rule 13: missing is `undefined`, `null`, an empty (or blank) string, or, for a number, anything not
 * finite after `Number()`. `0` and a numeric string such as `"2"` are values. A select's value (account
 * status) is text, so it is missing only when absent or empty.
 */
export function isValueMissing(value: unknown, numeric = true): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return numeric ? !Number.isFinite(Number(value)) : false;
}

/** A rule that needs a value and has none. */
export function isRuleBlank(rule: GroupRule, list: RuleList): boolean {
  if (!ruleNeedsValue(rule, list)) return false;
  const select = list === "groups" && TIER_ATTRIBUTES.find((a) => a.id === rule.attribute)?.valueType === "select";
  return isValueMissing(rule.value, !select);
}

/** The index of the first blank rule, or -1. */
export function firstBlankRule(rules: GroupRule[] | null | undefined, list: RuleList): number {
  return (rules ?? []).findIndex((r) => isRuleBlank(r, list));
}

/** The parts of an engine card's Save that hold a blank rule, in screen order. */
export type BlankRulePart = "eligibility" | "groups";

/**
 * Rule 13's Save check. It reads only what the Save would send: a part absent from `patch` is never
 * refused, so a blank rule stored before this change blocks only an edit of its own part.
 */
export function blankRuleParts(patch: {
  eligibilityRules?: GroupRule[] | null;
  invitationGroups?: InvitationGroup[] | null;
}): BlankRulePart[] {
  const parts: BlankRulePart[] = [];
  if ("eligibilityRules" in patch && firstBlankRule(patch.eligibilityRules, "bar") >= 0) parts.push("eligibility");
  if ("invitationGroups" in patch && (patch.invitationGroups ?? []).some((g) => firstBlankRule(g.rules, "groups") >= 0)) {
    parts.push("groups");
  }
  return parts;
}

/** The refusal's words per part; with both, the card's one reason is both sentences, bar first. */
export const BLANK_RULE_REASON_KEYS: Record<BlankRulePart, string> = {
  eligibility: "settings.engine.blankRule.eligibility",
  groups: "settings.engine.blankRule.groups",
};

export function blankRuleReason(parts: BlankRulePart[], t: (key: string) => string): string {
  return parts.map((p) => t(BLANK_RULE_REASON_KEYS[p])).join(" ");
}

/**
 * Rule 13 on a class (eligibility.cascade): the class Save reads its bar only when the edit sends it,
 * i.e. `eligibilityRules` is in the edit's changes (it differs from the loaded class). A standard
 * (`null`) or everyone (`[]`) bar never blocks. Returns the refusal's reason key, or null.
 */
export function classBarRefusal(changes: { eligibilityRules?: GroupRule[] | null }): string | null {
  return "eligibilityRules" in changes && firstBlankRule(changes.eligibilityRules, "bar") >= 0
    ? BLANK_RULE_REASON_KEYS.eligibility
    : null;
}
