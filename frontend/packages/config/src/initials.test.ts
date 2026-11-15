import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
  it("[MESSAGING-CONVERSATIONS-33] takes the first letter of the first two words, uppercased", () => {
    expect(initialsOf("ana silva")).toBe("AS");
    expect(initialsOf("Ana Beatriz Silva")).toBe("AB");
  });

  it("[MESSAGING-CONVERSATIONS-33] handles a single word and runs of spaces", () => {
    expect(initialsOf("Ana")).toBe("A");
    expect(initialsOf("  Ana   Silva  ")).toBe("AS");
  });

  it("[MESSAGING-CONVERSATIONS-33] falls back to ? for no name", () => {
    expect(initialsOf(undefined)).toBe("?");
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("")).toBe("?");
  });
});
