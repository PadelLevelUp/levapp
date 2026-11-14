import { describe, expect, it } from "vitest";
import {
  ELIGIBILITY_ATTRIBUTES,
  blankRuleParts,
  firstBlankRule,
  isRuleBlank,
  isValueMissing,
  ruleNeedsValue,
} from "./rule-values";
import { TIER_ATTRIBUTES } from "./invitation-tiers";

/**
 * eligibility.rules rule 13 (engine stream, blank rules): one answer, shared by the web and iOS editors
 * and their Saves, to "does this rule need a value, and is it missing".
 */

describe("a rule that needs a value (eligibility.rules rule 13)", () => {
  it('[ELIGIBILITY-RULES-19] a bar rule needs a value exactly when its operation takes one, and 0 or "2" is a value', () => {
    // Absence and attendance always; level only with the three within_n_* operations.
    for (const attr of ELIGIBILITY_ATTRIBUTES) {
      for (const op of attr.operations) {
        const expected = attr.id !== "level" || op.id === "within_n_of_class";
        expect(ruleNeedsValue({ attribute: attr.id, operation: op.id }, "bar"), `${attr.id} ${op.id}`).toBe(expected);
      }
    }
    for (const op of ["within_n_above_class", "within_n_below_class"]) {
      expect(ruleNeedsValue({ attribute: "level", operation: op }, "bar")).toBe(true);
    }
    // The bar offers no side, account status or makeups (rules 4, 5): none of them is marked there.
    expect(ruleNeedsValue({ attribute: "subscription_status", operation: "equals" }, "bar")).toBe(false);

    // Missing: undefined, null, "" and a number that is not finite after Number(); 0 and "2" are values.
    for (const v of [undefined, null, "", "  ", "abc", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValueMissing(v), String(v)).toBe(true);
    }
    for (const v of [0, "0", 2, "2", 12.5]) expect(isValueMissing(v), String(v)).toBe(false);

    expect(isRuleBlank({ attribute: "unjustified_absences", operation: "less_than" }, "bar")).toBe(true);
    expect(isRuleBlank({ attribute: "unjustified_absences", operation: "less_than", value: 0 }, "bar")).toBe(false);
    expect(isRuleBlank({ attribute: "level", operation: "within_n_of_class", value: "2" }, "bar")).toBe(false);
    expect(isRuleBlank({ attribute: "level", operation: "within_n_of_class" }, "bar")).toBe(true);
    expect(isRuleBlank({ attribute: "level", operation: "same_as_class" }, "bar")).toBe(false);
    expect(firstBlankRule([{ attribute: "level", operation: "same_as_class" }, { attribute: "attendance_rate", operation: "greater_than" }], "bar")).toBe(1);
    expect(firstBlankRule(null, "bar")).toBe(-1);

    // The Save reads only what it would send: a part absent from the patch is never refused.
    const blankBar = [{ attribute: "attendance_rate", operation: "greater_than" }];
    expect(blankRuleParts({ eligibilityRules: blankBar })).toEqual(["eligibility"]);
    expect(blankRuleParts({ autoNotifyEnabled: false })).toEqual([]);
    expect(blankRuleParts({ eligibilityRules: null })).toEqual([]);
  });

  it("[ELIGIBILITY-RULES-20] a group rule needs a value exactly when its attribute's value type is not none", () => {
    for (const attr of TIER_ATTRIBUTES) {
      for (const op of attr.operations) {
        expect(ruleNeedsValue({ attribute: attr.id, operation: op.id }, "groups"), `${attr.id} ${op.id}`).toBe(attr.valueType !== "none");
      }
    }
    expect(["level", "side", "has_makeups"].map((a) => ruleNeedsValue({ attribute: a, operation: "x" }, "groups"))).toEqual([false, false, false]);
    // A select value is missing only when absent or empty; it is not a number.
    expect(isRuleBlank({ attribute: "subscription_status", operation: "equals", value: "active" }, "groups")).toBe(false);
    expect(isRuleBlank({ attribute: "subscription_status", operation: "equals" }, "groups")).toBe(true);
    expect(isRuleBlank({ attribute: "justified_absences", operation: "less_than", value: "" }, "groups")).toBe(true);

    const groups = [
      { id: "a", rules: [{ attribute: "level", operation: "same_as_vacancy" }] },
      { id: "b", rules: [{ attribute: "side", operation: "same_as_vacancy" }, { attribute: "attendance_rate", operation: "greater_than" }] },
    ];
    expect(blankRuleParts({ invitationGroups: groups })).toEqual(["groups"]);
    expect(
      blankRuleParts({ eligibilityRules: [{ attribute: "level", operation: "within_n_of_class" }], invitationGroups: groups }),
    ).toEqual(["eligibility", "groups"]);
    expect(blankRuleParts({ invitationGroups: [{ id: "a", rules: [] }] })).toEqual([]);
  });
});
