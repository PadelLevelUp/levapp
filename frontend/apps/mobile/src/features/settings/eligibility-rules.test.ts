import type { GroupRule } from "@levelup/types";
import { describe, expect, it } from "vitest";

import {
  ELIGIBILITY_ATTRIBUTES,
  findAttribute,
  needsValue,
  newRule,
  removeRuleAt,
  withAttribute,
  withOperation,
} from "./eligibility-rules";

/**
 * PAD-161 / PAD-128. The eligibility bar shipped web-only; these pin the rule
 * transitions the iOS panel depends on, which web does inline in
 * `EligibilitySection.tsx` and which nothing tests today.
 */

describe("ELIGIBILITY_ATTRIBUTES", () => {
  it("offers level and absence criteria only — no side, no payments", () => {
    // eligibility.rules 4 and 5: side is a WAVE criterion (who is asked
    // first), never an eligibility one; and no payment state exists to read.
    expect(ELIGIBILITY_ATTRIBUTES.map((a) => a.id)).toEqual([
      "level",
      "unjustified_absences",
      "justified_absences",
      "attendance_rate",
    ]);
  });

  it("anchors every level operation to the class, not to a vacancy", () => {
    // The bar has to be answerable for a class with no spot open.
    const level = findAttribute("level");

    expect(level?.operations.map((o) => o.id)).toEqual([
      "same_as_class",
      "equal_or_above_class",
      "equal_or_below_class",
      "one_below_or_above_class",
      "within_n_of_class",
    ]);
  });
});

describe("needsValue", () => {
  it("is true for every plain number and percentage attribute", () => {
    expect(needsValue(findAttribute("unjustified_absences")!, "less_than")).toBe(true);
    expect(needsValue(findAttribute("attendance_rate")!, "greater_than")).toBe(true);
  });

  it("is true for only the one level operation that carries a value", () => {
    const level = findAttribute("level")!;

    expect(needsValue(level, "within_n_of_class")).toBe(true);
    expect(needsValue(level, "same_as_class")).toBe(false);
    expect(needsValue(level, "equal_or_above_class")).toBe(false);
  });
});

describe("newRule", () => {
  it("starts on the first attribute's first operation, with no value", () => {
    expect(newRule()).toEqual<GroupRule>({
      attribute: "level",
      operation: "same_as_class",
    });
  });
});

describe("withAttribute", () => {
  it("resets the operation, because operations are per-attribute", () => {
    // Keeping the old one would pair e.g. `greater_than` with `level`.
    expect(withAttribute("attendance_rate")).toEqual({
      attribute: "attendance_rate",
      operation: "greater_than",
      value: undefined,
    });
  });

  it("drops any value carried over from the previous attribute", () => {
    expect(withAttribute("level").value).toBeUndefined();
  });

  it("leaves the operation empty for an unknown attribute", () => {
    expect(withAttribute("nope")).toEqual({
      attribute: "nope",
      operation: "",
      value: undefined,
    });
  });
});

describe("withOperation", () => {
  it("drops a value that the new operation does not take", () => {
    // `level within_n_of_class 2` -> `same_as_class` must not keep the 2.
    const rule: GroupRule = {
      attribute: "level",
      operation: "within_n_of_class",
      value: 2,
    };

    expect(withOperation(rule, "same_as_class")).toEqual({
      attribute: "level",
      operation: "same_as_class",
      value: undefined,
    });
  });

  it("keeps the value when the new operation still takes one", () => {
    const rule: GroupRule = {
      attribute: "unjustified_absences",
      operation: "less_than",
      value: 3,
    };

    expect(withOperation(rule, "equals").value).toBe(3);
  });

  it("keeps the value moving between two value-carrying level operations", () => {
    const rule: GroupRule = {
      attribute: "level",
      operation: "within_n_of_class",
      value: 2,
    };

    expect(withOperation(rule, "within_n_of_class").value).toBe(2);
  });
});

describe("removeRuleAt", () => {
  const a: GroupRule = { attribute: "level", operation: "same_as_class" };
  const b: GroupRule = {
    attribute: "unjustified_absences",
    operation: "less_than",
    value: 3,
  };

  it("removes just the rule at that index", () => {
    expect(removeRuleAt([a, b], 0)).toEqual([b]);
    expect(removeRuleAt([a, b], 1)).toEqual([a]);
  });

  it("returns null — not an empty array — when the last rule goes", () => {
    // null is "no bar defined"; [] would be a bar with no rules. At the coach
    // tier they behave the same, and null is the honest representation.
    expect(removeRuleAt([a], 0)).toBeNull();
  });
});
