import { describe, expect, it } from "vitest";
import { searchPeopleByName, searchRoster } from "./player-search";

// players.search (PAD-665): the shared call sites.
const p = (playerId: number, name: string, extra: { email?: string; phone?: string } = {}) => ({
  playerId,
  name,
  ...extra,
});

describe("searchRoster", () => {
  it("finds 'rui basto' → 'Rui Pedro Basto' and 'andre' → 'André'", () => {
    const roster = [p(1, "Rui Pedro Basto"), p(2, "André Nunes")];
    expect(searchRoster(roster, "rui basto")).toEqual([roster[0]]);
    expect(searchRoster(roster, "andre")).toEqual([roster[1]]);
  });

  it("lists the best match first and keeps a blank query in the given order", () => {
    const roster = [p(1, "Ana Rita"), p(2, "Rita Zé")];
    expect(searchRoster(roster, "rita").map((r) => r.playerId)).toEqual([2, 1]);
    expect(searchRoster(roster, "").map((r) => r.playerId)).toEqual([1, 2]);
  });

  it("searches email and phone only where the row carries them", () => {
    const roster = [p(1, "Ana", { email: "ana.rita@x.pt", phone: "+351 912 345 678" }), p(2, "Bruno")];
    expect(searchRoster(roster, "345 678").map((r) => r.playerId)).toEqual([1]);
    // Decision 2026-10-14 (b): the email's local part matches, its domain never does.
    expect(searchRoster(roster, "anarita").map((r) => r.playerId)).toEqual([1]);
    expect(searchRoster(roster, "x.pt").map((r) => r.playerId)).toEqual([]);
  });

  it("never returns a row that was not passed in", () => {
    expect(searchRoster([p(1, "Ana")], "bruno")).toEqual([]);
  });
});

describe("searchPeopleByName", () => {
  const people = [{ name: "Ana Rita" }, { name: "Rita Zé" }, { name: "Rui Pedro Basto" }, { name: "André" }];
  const nameOf = (x: { name: string }) => x.name;

  it("coach: 'rui basto' finds 'Rui Pedro Basto', 'andre' finds 'André', best first", () => {
    expect(searchPeopleByName(people, "rui basto", nameOf, { coach: true })).toEqual([people[2]]);
    expect(searchPeopleByName(people, "andre", nameOf, { coach: true })).toEqual([people[3]]);
    expect(searchPeopleByName(people, "rita", nameOf, { coach: true })).toEqual([people[1], people[0]]);
  });

  it("coach: a blank query keeps the order", () => {
    expect(searchPeopleByName(people, "", nameOf, { coach: true })).toEqual(people);
  });

  it("student: the plain substring match and the original order, unchanged", () => {
    expect(searchPeopleByName(people, "rita", nameOf, { coach: false })).toEqual([people[0], people[1]]);
    expect(searchPeopleByName(people, "RUI BASTO", nameOf, { coach: false })).toEqual([]);
    expect(searchPeopleByName(people, "andre", nameOf, { coach: false })).toEqual([]);
    expect(searchPeopleByName(people, "", nameOf, { coach: false })).toEqual(people);
  });
});
