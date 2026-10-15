import { describe, expect, it } from "vitest";
import type { CoachPlayer } from "@levelup/types";

import {
  filterPlayers,
  isOutOfLevel,
  selectedPlayersOf,
  togglePlayerId,
} from "./player-selector-logic";

/**
 * classes.create rule 10 / classes.edit rule 9 (PAD-474): the mobile participant
 * picker behaves as web's PlayerSelector (components/calendar/PlayerSelector.tsx):
 * search ignores accents and case and overrides the level filter, a student
 * outside the class's level is marked, and selection is by playerId.
 */
const player = (playerId: string, name: string, levelId?: string): CoachPlayer =>
  ({ id: `cp-${playerId}`, playerId, name, levelId }) as unknown as CoachPlayer;

const ana = player("1", "Ana Álvares", "10");
const bruno = player("2", "Bruno Costa", "20");
const jose = player("3", "José", undefined);
const all = [ana, bruno, jose];

describe("filterPlayers", () => {
  it("search ignores accents and case", () => {
    expect(filterPlayers(all, { search: "alvares", levelId: null })).toEqual([ana]);
    expect(filterPlayers(all, { search: "JOSE", levelId: null })).toEqual([jose]);
  });

  it("filters by level when not searching", () => {
    expect(filterPlayers(all, { search: "", levelId: "20" })).toEqual([bruno]);
  });

  it("a search overrides the level filter, as on web", () => {
    expect(filterPlayers(all, { search: "ana", levelId: "20" })).toEqual([ana]);
  });

  it("no search and no level keeps every student in order", () => {
    expect(filterPlayers(all, { search: "  ", levelId: null })).toEqual(all);
  });
});

// PAD-665 (players.search): the picker's search is the shared name rule.
describe("filterPlayers search (PAD-665)", () => {
  const people = [
    player("1", "Ana Rita"),
    player("2", "Rita Zé"),
    player("3", "Rui Pedro Basto"),
    player("4", "André"),
  ];
  const ids = (search: string) => filterPlayers(people, { search, levelId: null }).map((p) => p.playerId);

  it("finds 'rui basto' → 'Rui Pedro Basto' and 'andre' → 'André'", () => {
    expect(ids("rui basto")).toEqual(["3"]);
    expect(ids("andre")).toEqual(["4"]);
  });

  it("lists the best match first: 'rita' → 'Rita Zé' before 'Ana Rita'", () => {
    expect(ids("rita")).toEqual(["2", "1"]);
  });

  it("keeps the original order for a blank search and never adds a student", () => {
    expect(ids("")).toEqual(["1", "2", "3", "4"]);
    expect(ids("zzzz-nobody")).toEqual([]);
  });
});

describe("isOutOfLevel", () => {
  it("marks a student whose level is not the class's", () => {
    expect(isOutOfLevel(bruno, "10")).toBe(true);
    expect(isOutOfLevel(jose, "10")).toBe(true);
  });

  it("does not mark a student at the class's level, compared as strings", () => {
    expect(isOutOfLevel(ana, 10 as unknown as string)).toBe(false);
  });

  it("marks nobody when the class has no level", () => {
    expect(isOutOfLevel(bruno, null)).toBe(false);
    expect(isOutOfLevel(bruno, "")).toBe(false);
  });
});

describe("selectedPlayersOf", () => {
  it("returns the chosen students, matching numeric and string ids", () => {
    expect(selectedPlayersOf(all, ["2", 3 as unknown as string])).toEqual([bruno, jose]);
  });
});

describe("togglePlayerId", () => {
  it("adds an unchosen student and removes a chosen one", () => {
    expect(togglePlayerId(["1"], "2")).toEqual(["1", "2"]);
    expect(togglePlayerId(["1", "2"], "1")).toEqual(["2"]);
  });

  it("treats a numeric id as the same student", () => {
    expect(togglePlayerId([1 as unknown as string], "1")).toEqual([]);
  });
});

describe("filterPlayers matches every word in any order (PAD-516)", () => {
  const pedro = player("9", "Pedro Mesquita e Sousa");
  const alves = player("10", "Pedro Alves");
  it("finds the name with the words out of order and skips one missing a word", () => {
    expect(filterPlayers([pedro, alves], { search: "pedro sousa", levelId: null })).toEqual([pedro]);
    expect(filterPlayers([pedro, alves], { search: "sousa pedro", levelId: null })).toEqual([pedro]);
  });
});

describe("PAD-660: the class editor's picker finds a student by the coach's nickname", () => {
  it("matches the display name as well as the real name", () => {
    const rows = [
      { playerId: "7", name: "Jorge Silva", displayName: "Jorge chato" },
      { playerId: "8", name: "Ana Pinto", displayName: "Ana Pinto" },
    ] as never;
    expect(filterPlayers(rows, { search: "chato", levelId: null }).map((p: { playerId: string }) => p.playerId)).toEqual(["7"]);
    expect(filterPlayers(rows, { search: "silva", levelId: null }).map((p: { playerId: string }) => p.playerId)).toEqual(["7"]);
  });
});
