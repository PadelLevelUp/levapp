import { describe, expect, it } from "vitest";
import { hasUnsavedClassEdit } from "./classEditUnsaved";

/** classes.edit rule 10 (PAD-525): the sheet asks before a close only when this says unsaved. */
const FIELDS = ["name", "startTime", "maxPlayers", "levelId"] as const;
const original = {
  name: "Quinta 18h", startTime: "18:00", maxPlayers: 4, levelId: "5",
  participants: [{ id: "1" }, { id: "2" }],
};

describe("hasUnsavedClassEdit (PAD-525, classes.edit rule 10)", () => {
  it("is clean when nothing changed", () => {
    expect(hasUnsavedClassEdit(original, structuredClone(original), FIELDS)).toBe(false);
  });

  it("is clean when a change was typed back to its value", () => {
    const draft = { ...structuredClone(original), name: "Quinta 18h" };
    expect(hasUnsavedClassEdit(original, draft, FIELDS)).toBe(false);
  });

  it("is unsaved when a sent field differs", () => {
    expect(hasUnsavedClassEdit(original, { ...structuredClone(original), name: "Changed" }, FIELDS)).toBe(true);
    expect(hasUnsavedClassEdit(original, { ...structuredClone(original), maxPlayers: 6 }, FIELDS)).toBe(true);
  });

  it("is unsaved when a student is added or removed, and clean when only the order changed", () => {
    expect(hasUnsavedClassEdit(original, { ...structuredClone(original), participants: [{ id: "1" }] }, FIELDS)).toBe(true);
    expect(hasUnsavedClassEdit(original, { ...structuredClone(original), participants: [{ id: "1" }, { id: "3" }] }, FIELDS)).toBe(true);
    expect(hasUnsavedClassEdit(original, { ...structuredClone(original), participants: [{ id: "2" }, { id: "1" }] }, FIELDS)).toBe(false);
  });

  it("ignores a field the save does not send", () => {
    const draft = { ...structuredClone(original), notes: "scratch" } as typeof original & { notes: string };
    expect(hasUnsavedClassEdit(original, draft, FIELDS)).toBe(false);
  });
});
