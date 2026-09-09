import { describe, expect, it } from "vitest";

import {
  EDITABLE_CLASS_FIELDS,
  diffInstance,
  diffParticipants,
} from "./edit-class-diff";

describe("EDITABLE_CLASS_FIELDS", () => {
  // Mirrors web's EDITABLE_FIELDS in ClassDetailSheet.tsx. If the two lists drift,
  // an edit that works on web silently does nothing on iOS.
  it("lists exactly the fields the edit-class sheet may change", () => {
    expect([...EDITABLE_CLASS_FIELDS]).toEqual([
      "name",
      "date",
      "startTime",
      "endTime",
      "color",
      "maxPlayers",
      "levelId",
      "courtId",
      "recurrenceEnd",
      "notificationsEnabled",
    ]);
  });
});

describe("diffInstance", () => {
  const fields = ["name", "startTime", "maxPlayers"] as const;

  it("returns an empty diff when nothing changed", () => {
    const original = { name: "Group A", startTime: "10:00", maxPlayers: 4 };
    expect(diffInstance(original, { ...original }, fields)).toEqual({});
  });

  it("includes only the changed fields", () => {
    const original = { name: "Group A", startTime: "10:00", maxPlayers: 4 };
    const updated = { ...original, startTime: "11:00" };
    expect(diffInstance(original, updated, fields)).toEqual({
      startTime: "11:00",
    });
  });

  it("ignores fields outside the allow-list", () => {
    const original = { name: "Group A", startTime: "10:00", maxPlayers: 4, id: 1 };
    const updated = { ...original, id: 2 };
    expect(diffInstance(original, updated, fields)).toEqual({});
  });

  it("compares nested values structurally, not by reference", () => {
    const original = { rule: { freq: "WEEKLY", days: ["MO"] } };
    const same = { rule: { freq: "WEEKLY", days: ["MO"] } };
    const changed = { rule: { freq: "WEEKLY", days: ["MO", "WE"] } };
    const nested = ["rule"] as const;

    expect(diffInstance(original, same, nested)).toEqual({});
    expect(diffInstance(original, changed, nested)).toEqual({
      rule: { freq: "WEEKLY", days: ["MO", "WE"] },
    });
  });

  it("keeps a field that was cleared to null", () => {
    const original = { color: "#ff0000" } as { color: string | null };
    const updated = { color: null } as { color: string | null };
    expect(diffInstance(original, updated, ["color"])).toEqual({ color: null });
  });
});

describe("diffParticipants", () => {
  it("splits the change into adds and removes", () => {
    const result = diffParticipants(
      [{ id: "1" }, { id: "2" }],
      [{ id: "2" }, { id: "3" }]
    );
    expect(result).toEqual({ addPlayers: ["3"], removePlayers: ["1"] });
  });

  it("returns empty lists when the roster is unchanged", () => {
    const roster = [{ id: "1" }, { id: "2" }];
    expect(diffParticipants(roster, [...roster])).toEqual({
      addPlayers: [],
      removePlayers: [],
    });
  });

  it("is order-independent", () => {
    expect(
      diffParticipants([{ id: "1" }, { id: "2" }], [{ id: "2" }, { id: "1" }])
    ).toEqual({ addPlayers: [], removePlayers: [] });
  });

  it("handles emptying and filling the roster", () => {
    expect(diffParticipants([{ id: "1" }], [])).toEqual({
      addPlayers: [],
      removePlayers: ["1"],
    });
    expect(diffParticipants([], [{ id: "1" }])).toEqual({
      addPlayers: ["1"],
      removePlayers: [],
    });
  });

  it("dedupes a repeated id", () => {
    expect(diffParticipants([], [{ id: "7" }, { id: "7" }])).toEqual({
      addPlayers: ["7"],
      removePlayers: [],
    });
  });
});
