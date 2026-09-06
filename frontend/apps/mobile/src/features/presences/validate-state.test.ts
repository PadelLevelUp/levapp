import { describe, expect, it } from "vitest";
import type {
  PendingValidationClass,
  PendingValidationPlayer,
} from "@levelup/types";

import {
  availableRoster,
  clearValidated,
  filterRoster,
  makeWalkIn,
  partitionSelection,
  readyClassIds,
  remainingFor,
  resolvePresences,
  sortPlayers,
  toggleSelection,
  withExtras,
  type Edits,
} from "./validate-state";

/**
 * PAD-185 — the roster-diff and selection arithmetic behind the iOS validate flow.
 *
 * These are the assertions the mobile suite can actually make: the sheet itself is
 * a React Native tree that vitest does not render here (see `vitest.config.ts`).
 * Everything that can be silently wrong — a walk-in rendered twice after a refetch,
 * a bulk validate quietly force-approving a class with an unanswered player — is
 * pinned in this file.
 */

function player(
  overrides: Partial<PendingValidationPlayer> & { playerId: number; name: string }
): PendingValidationPlayer {
  return {
    presenceId: overrides.playerId * 10,
    response: "none",
    status: null,
    justification: null,
    validated: false,
    lateCancellation: false,
    guest: false,
    ...overrides,
  };
}

function klass(
  id: number,
  players: PendingValidationPlayer[],
  overrides: Partial<PendingValidationClass> = {}
): PendingValidationClass {
  return {
    lessonInstanceId: id,
    calendarEventId: `lessoninstance-${id}`,
    title: `Class ${id}`,
    type: "academy",
    startDatetime: "2026-09-01T10:00:00",
    date: "2026-09-01",
    players,
    unanswered: players.filter((p) => p.response === "none" && p.status === null)
      .length,
    ready: false,
    ...overrides,
  };
}

const ana = player({ playerId: 1, name: "Ana", response: "confirmed" });
const bruno = player({ playerId: 2, name: "Bruno", response: "declined" });
const silent = player({ playerId: 3, name: "Carlos", response: "none" });

describe("makeWalkIn", () => {
  it("produces a guest row with no stored decision", () => {
    const walkIn = makeWalkIn({ id: 7, name: "Diana" });
    expect(walkIn).toMatchObject({
      playerId: 7,
      name: "Diana",
      response: "none",
      status: null,
      justification: null,
      validated: false,
      guest: true,
    });
  });

  it("gives the pending row an id that cannot collide with a real presence", () => {
    // Real presence ids are positive; a walk-in has no row yet.
    expect(makeWalkIn({ id: 7, name: "Diana" }).presenceId).toBeLessThan(0);
  });
});

describe("withExtras", () => {
  it("appends a locally added walk-in to the class roster", () => {
    const merged = withExtras(klass(1, [ana]), {
      1: [makeWalkIn({ id: 9, name: "Eva" })],
    });
    expect(merged.players.map((p) => p.playerId)).toEqual([1, 9]);
  });

  it("drops a local walk-in once the server returns the same player", () => {
    // After validating, the refetch carries the walk-in as a real presence row.
    // Keeping the local copy too would render them twice with a duplicate key.
    const server = player({ playerId: 9, name: "Eva", guest: true, validated: true });
    const merged = withExtras(klass(1, [ana, server]), {
      1: [makeWalkIn({ id: 9, name: "Eva" })],
    });
    expect(merged.players).toHaveLength(2);
    expect(merged.players.find((p) => p.playerId === 9)?.validated).toBe(true);
  });

  it("returns the same object when the class has no extras", () => {
    const original = klass(1, [ana]);
    expect(withExtras(original, {})).toBe(original);
    expect(withExtras(original, { 2: [makeWalkIn({ id: 9, name: "Eva" })] })).toBe(
      original
    );
  });
});

describe("availableRoster / filterRoster", () => {
  const roster = [
    { id: 1, name: "Ana" },
    { id: 4, name: "Gonçalo" },
    { id: 5, name: "Helena" },
  ];

  it("excludes players already on the class", () => {
    expect(availableRoster(roster, klass(1, [ana])).map((r) => r.id)).toEqual([
      4, 5,
    ]);
  });

  it("matches ignoring case and accents", () => {
    expect(filterRoster(roster, "goncalo").map((r) => r.id)).toEqual([4]);
    expect(filterRoster(roster, "HEL").map((r) => r.id)).toEqual([5]);
  });

  it("returns everything for an empty or blank query", () => {
    expect(filterRoster(roster, "")).toHaveLength(3);
    expect(filterRoster(roster, "   ")).toHaveLength(3);
  });
});

describe("remainingFor", () => {
  it("counts only players with no stored, prefilled or edited mark", () => {
    // confirmed → present and declined → justified are prefills, not blockers.
    expect(remainingFor(klass(1, [ana, bruno, silent]), {})).toBe(1);
  });

  it("falls to zero once the coach decides the silent player", () => {
    const edits: Edits = { 1: { 3: "present" } };
    expect(remainingFor(klass(1, [ana, bruno, silent]), edits)).toBe(0);
  });

  it("ignores edits belonging to another class", () => {
    const edits: Edits = { 2: { 3: "present" } };
    expect(remainingFor(klass(1, [ana, bruno, silent]), edits)).toBe(1);
  });
});

describe("resolvePresences", () => {
  it("maps each resolved mark to its status/justification pair", () => {
    expect(resolvePresences(klass(1, [ana, bruno]), {})).toEqual([
      { playerId: 1, status: "present" },
      { playerId: 2, status: "absent", justification: "justified" },
    ]);
  });

  it("lets a local edit override the prefill", () => {
    expect(resolvePresences(klass(1, [bruno]), { 2: "unjustified" })).toEqual([
      { playerId: 2, status: "absent", justification: "unjustified" },
    ]);
  });

  it("omits an undecided player rather than inventing an answer", () => {
    expect(resolvePresences(klass(1, [ana, silent]), {})).toEqual([
      { playerId: 1, status: "present" },
    ]);
  });

  it("includes a walk-in the coach just added", () => {
    const merged = withExtras(klass(1, [ana]), {
      1: [makeWalkIn({ id: 9, name: "Eva" })],
    });
    expect(resolvePresences(merged, { 9: "present" })).toEqual([
      { playerId: 1, status: "present" },
      { playerId: 9, status: "present" },
    ]);
  });
});

describe("sortPlayers", () => {
  it("puts undecided players first, then sorts by name", () => {
    const zoe = player({ playerId: 4, name: "Zoe", response: "none" });
    expect(
      sortPlayers([ana, silent, bruno, zoe], {}).map((p) => p.name)
    ).toEqual(["Carlos", "Zoe", "Ana", "Bruno"]);
  });

  it("moves a player down once they are decided", () => {
    expect(
      sortPlayers([ana, silent], { 3: "present" }).map((p) => p.name)
    ).toEqual(["Ana", "Carlos"]);
  });

  it("does not mutate the input array", () => {
    const players = [silent, ana];
    sortPlayers(players, {});
    expect(players.map((p) => p.playerId)).toEqual([3, 1]);
  });
});

describe("selection", () => {
  const ready = klass(1, [ana, bruno]);
  const blocked = klass(2, [ana, silent]);

  it("lists only the classes with nothing outstanding as ready", () => {
    expect(readyClassIds([ready, blocked], {})).toEqual([1]);
    expect(readyClassIds([ready, blocked], { 2: { 3: "justified" } })).toEqual([
      1, 2,
    ]);
  });

  it("toggles an id in and out", () => {
    expect(toggleSelection([], 1)).toEqual([1]);
    expect(toggleSelection([1, 2], 1)).toEqual([2]);
  });

  it("splits a selection into validatable and skipped", () => {
    const { ready: ok, needs } = partitionSelection([ready, blocked], [1, 2], {});
    expect(ok.map((c) => c.lessonInstanceId)).toEqual([1]);
    expect(needs.map((c) => c.lessonInstanceId)).toEqual([2]);
  });

  it("never force-approves a class with an unanswered player", () => {
    const { ready: ok } = partitionSelection([blocked], [2], {});
    expect(ok).toHaveLength(0);
  });

  it("ignores ids that are not in the selection", () => {
    const { ready: ok, needs } = partitionSelection([ready, blocked], [2], {});
    expect(ok).toHaveLength(0);
    expect(needs.map((c) => c.lessonInstanceId)).toEqual([2]);
  });

  it("keeps the skipped classes selected after a partial validate", () => {
    expect(clearValidated([1, 2], [1])).toEqual([2]);
  });
});
