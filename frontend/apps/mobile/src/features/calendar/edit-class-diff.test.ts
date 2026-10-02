import { describe, expect, it } from "vitest";

import {
  EDITABLE_CLASS_FIELDS,
  buildClassEditChanges,
  diffInstance,
  diffParticipants,
  presencesOfParticipants,
  toggleDraftParticipant,
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
      "eligibilityRules",
      "openSpotsVisible",
      "autoInvites",
    ]);
  });
});

describe("EDITABLE_CLASS_FIELDS carries autoInvites through the tri-state (PAD-429)", () => {
  it("passes null (inherit) through diffInstance when cleared", () => {
    const original = { autoInvites: true } as { autoInvites: boolean | null };
    const updated = { autoInvites: null } as { autoInvites: boolean | null };
    expect(diffInstance(original, updated, ["autoInvites"])).toEqual({ autoInvites: null });
  });

  it("passes true through diffInstance when turned on", () => {
    const original = { autoInvites: null } as { autoInvites: boolean | null };
    const updated = { autoInvites: true } as { autoInvites: boolean | null };
    expect(diffInstance(original, updated, ["autoInvites"])).toEqual({ autoInvites: true });
  });

  it("passes false through diffInstance when turned off", () => {
    const original = { autoInvites: null } as { autoInvites: boolean | null };
    const updated = { autoInvites: false } as { autoInvites: boolean | null };
    expect(diffInstance(original, updated, ["autoInvites"])).toEqual({ autoInvites: false });
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

// classes.edit rule 9 (PAD-474, B-239): the iOS edit screen's change set carries
// the participant diff. Before PAD-474 the screen returned early on an empty
// field diff, so an edit that only added or removed students was dropped.
describe("buildClassEditChanges carries participants (classes.edit rule 9)", () => {
  const base = {
    name: "Terça 18h",
    maxPlayers: 4,
    participants: [{ id: "1" }],
  };

  it("a participants-only edit is a change, not 'no changes'", () => {
    const changes = buildClassEditChanges(base, {
      ...base,
      participants: [{ id: "1" }, { id: "2" }],
    });
    expect(changes).toEqual({ addPlayers: ["2"] });
  });

  it("sends the added and removed ids and nothing else", () => {
    const changes = buildClassEditChanges(base, { ...base, participants: [{ id: "2" }] });
    expect(changes).toEqual({ addPlayers: ["2"], removePlayers: ["1"] });
  });

  it("keeps field changes beside the participant diff", () => {
    const changes = buildClassEditChanges(base, {
      ...base,
      name: "Quarta 18h",
      participants: [],
    });
    expect(changes).toEqual({ name: "Quarta 18h", removePlayers: ["1"] });
  });

  it("an untouched draft is still empty", () => {
    expect(buildClassEditChanges(base, structuredClone(base))).toEqual({});
  });
});

describe("diffParticipants compares ids as strings (classes.edit rule 9)", () => {
  // The API serialises a participant id as a number; the picker hands back the
  // coach-player's playerId as a string. Unticking and re-ticking a student must
  // send nothing.
  it("a numeric original and a string re-tick are the same student", () => {
    const original = [{ id: 7 as unknown as string }];
    expect(diffParticipants(original, [{ id: "7" }])).toEqual({ addPlayers: [], removePlayers: [] });
  });

  it("reports ids as strings", () => {
    expect(diffParticipants([{ id: 7 as unknown as string }], [{ id: "9" }])).toEqual({
      addPlayers: ["9"],
      removePlayers: ["7"],
    });
  });
});

describe("toggleDraftParticipant (classes.edit rule 9)", () => {
  const roster = [
    { playerId: "1", userId: "u1" },
    { playerId: "2", userId: "u2" },
  ];

  it("ticking adds the student with their user id", () => {
    expect(toggleDraftParticipant([{ id: "1", userId: "u1" }], "2", roster)).toEqual([
      { id: "1", userId: "u1" },
      { id: "2", userId: "u2" },
    ]);
  });

  it("unticking removes them, matching a numeric id", () => {
    expect(toggleDraftParticipant([{ id: 1 as unknown as string, userId: "u1" }], "1", roster)).toEqual([]);
  });

  it("untick then re-tick sends nothing", () => {
    const original = [{ id: 1 as unknown as string, userId: "u1" }];
    const once = toggleDraftParticipant(original, "1", roster);
    const twice = toggleDraftParticipant(once, "1", roster);
    expect(buildClassEditChanges({ participants: original }, { participants: twice })).toEqual({});
  });

  it("a student the roster does not know is not added", () => {
    expect(toggleDraftParticipant([], "9", roster)).toEqual([]);
  });
});

describe("presencesOfParticipants (the edit count, classes.edit rule 9)", () => {
  // effectiveFilledSpots subtracts every declined presence; a student unticked in
  // the draft must not be subtracted as well.
  it("keeps only the presences of the counted participants", () => {
    const presences = [
      { playerId: 1, status: "absent" },
      { playerId: 2, status: "present" },
    ];
    expect(presencesOfParticipants(presences, [{ id: "2" }])).toEqual([{ playerId: 2, status: "present" }]);
  });

  it("is empty for no presences", () => {
    expect(presencesOfParticipants(undefined, [{ id: "1" }])).toEqual([]);
  });
});
