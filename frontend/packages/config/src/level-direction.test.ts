import { describe, expect, it } from "vitest";
import {
  isWithinNOperation,
  menuOperation,
  operationForMenuPick,
  withinNDirection,
  withinNOperation,
} from "./level-direction";

describe("level direction (PAD-481)", () => {
  it("maps each direction to its stored operation and back", () => {
    expect(withinNOperation("both")).toBe("within_n_of_class");
    expect(withinNOperation("above")).toBe("within_n_above_class");
    expect(withinNOperation("below")).toBe("within_n_below_class");
    for (const d of ["both", "above", "below"] as const) {
      expect(withinNDirection(withinNOperation(d))).toBe(d);
    }
  });

  it("a stored within_n_of_class (every bar set before PAD-481) reads as both", () => {
    expect(withinNDirection("within_n_of_class")).toBe("both");
  });

  it("other operations have no direction and keep their own menu entry", () => {
    for (const op of ["same_as_class", "equal_or_above_class", "equal_or_below_class", "one_below_or_above_class"]) {
      expect(withinNDirection(op)).toBeNull();
      expect(isWithinNOperation(op)).toBe(false);
      expect(menuOperation(op)).toBe(op);
    }
  });

  it("the three within-N operations share one menu entry", () => {
    expect(menuOperation("within_n_above_class")).toBe("within_n_of_class");
    expect(menuOperation("within_n_below_class")).toBe("within_n_of_class");
    expect(menuOperation("within_n_of_class")).toBe("within_n_of_class");
  });

  it("picking within N keeps an existing direction, and starts at both otherwise", () => {
    expect(operationForMenuPick("within_n_above_class", "within_n_of_class")).toBe("within_n_above_class");
    expect(operationForMenuPick("same_as_class", "within_n_of_class")).toBe("within_n_of_class");
    expect(operationForMenuPick("within_n_below_class", "same_as_class")).toBe("same_as_class");
  });
});
