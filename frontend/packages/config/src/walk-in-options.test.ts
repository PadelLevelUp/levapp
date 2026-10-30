import { describe, expect, it } from "vitest";
import { walkInEmptyReason, walkInOptions } from "./walk-in-options";

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

describe("walkInOptions: the nickname (PAD-683)", () => {
  const people = [
    { id: 1, name: "Rui Pedro Basto", nickname: "Tigre", displayName: "Tigre" },
    { id: 2, name: "Ana Rita" },
  ];

  it("finds the student by either name", () => {
    expect(walkInOptions(people, "tigre").map((o) => o.id)).toEqual([1]);
    expect(walkInOptions(people, "rui basto").map((o) => o.id)).toEqual([1]);
  });

  it("lists them alphabetically by the name the coach reads", () => {
    expect(walkInOptions(people, "").map((o) => o.id)).toEqual([2, 1]); // Ana, Tigre
  });
});

describe("walkInEmptyReason (PAD-787, attendance.validation rule 8b)", () => {
  const inClass = [
    { id: 7, name: "Gonçalo Simões", nickname: "Gugu" },
    { id: 8, name: "Rui Pedro Basto" },
  ];

  it("names the student already in the class, by real name or nickname, accents ignored", () => {
    expect(walkInEmptyReason(inClass, 0, "goncalo simoes")).toEqual({ kind: "inClass", playerId: 7 });
    expect(walkInEmptyReason(inClass, 0, "Gugu")).toEqual({ kind: "inClass", playerId: 7 });
    expect(walkInEmptyReason(inClass, 0, "rui basto")).toEqual({ kind: "inClass", playerId: 8 });
  });

  it("says the student is not on the roster when nobody in the class matches either", () => {
    expect(walkInEmptyReason(inClass, 0, "Xavier")).toEqual({ kind: "notOnRoster" });
    expect(walkInEmptyReason([], 0, "Xavier")).toEqual({ kind: "notOnRoster" });
  });

  it("explains nothing for a blank search or when the picker lists someone", () => {
    expect(walkInEmptyReason(inClass, 0, "   ")).toEqual({ kind: "none" });
    expect(walkInEmptyReason(inClass, 2, "goncalo")).toEqual({ kind: "none" });
  });
});
