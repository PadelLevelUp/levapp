import { describe, expect, it } from "vitest";
import { classLevelMatch } from "./class-level-match";

describe("classLevelMatch (PAD-527)", () => {
  it("reads the student's level against the class's", () => {
    expect(classLevelMatch("3", "3")).toBe("same");
    expect(classLevelMatch(3, "3")).toBe("same");
    expect(classLevelMatch("2", "3")).toBe("other");
  });
  it("marks a student with no level as outside a levelled class", () => {
    expect(classLevelMatch(null, "3")).toBe("other");
    expect(classLevelMatch(undefined, 3)).toBe("other");
  });
  it("is neutral when the class has no level", () => {
    expect(classLevelMatch("2", null)).toBe("none");
    expect(classLevelMatch(null, "")).toBe("none");
  });
});
