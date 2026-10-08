import { describe, expect, it } from "vitest";
import { walkInOptions } from "./walk-in-options";

const roster = [
  { id: 1, name: "Zé Costa" },
  { id: 2, name: "ana silva" },
  { id: 3, name: "Álvaro Mendes" },
  { id: 4, name: "Bruno Silva Ramos" },
];

describe("walkInOptions (PAD-537, attendance.validation rule 8a)", () => {
  it("lists alphabetically, accents and case ignored", () => {
    expect(walkInOptions(roster, "").map((o) => o.id)).toEqual([3, 2, 4, 1]);
  });

  it("filters by every typed word, in any order (PAD-516's rule)", () => {
    expect(walkInOptions(roster, "silva").map((o) => o.id)).toEqual([2, 4]);
    expect(walkInOptions(roster, "silva ana").map((o) => o.id)).toEqual([2]);
    expect(walkInOptions(roster, "alv").map((o) => o.id)).toEqual([3]);
  });

  it("does not reorder the caller's array", () => {
    const copy = [...roster];
    walkInOptions(roster, "");
    expect(roster).toEqual(copy);
  });
});
