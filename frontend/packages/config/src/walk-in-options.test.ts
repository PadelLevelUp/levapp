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

  // PAD-665 (players.search rules 5, 6): a typed search lists the best match first.
  it("finds 'rui basto' → 'Rui Pedro Basto' and 'andre' → 'André'", () => {
    const people = [{ id: 1, name: "Rui Pedro Basto" }, { id: 2, name: "André Nunes" }];
    expect(walkInOptions(people, "rui basto").map((o) => o.id)).toEqual([1]);
    expect(walkInOptions(people, "andre").map((o) => o.id)).toEqual([2]);
  });

  it("lists the best match first: 'rita' → 'Rita Zé' before 'Ana Rita' (was alphabetical)", () => {
    const people = [{ id: 1, name: "Ana Rita" }, { id: 2, name: "Rita Zé" }];
    expect(walkInOptions(people, "rita").map((o) => o.id)).toEqual([2, 1]);
    expect(walkInOptions(people, "").map((o) => o.id)).toEqual([1, 2]);
  });

  it("never lists anyone outside the roster", () => {
    expect(walkInOptions(roster, "zzzz-nobody")).toEqual([]);
  });

  it("does not reorder the caller's array", () => {
    const copy = [...roster];
    walkInOptions(roster, "");
    expect(roster).toEqual(copy);
  });
});
