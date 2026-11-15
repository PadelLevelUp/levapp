import { describe, expect, it } from "vitest";

import { diffParticipants } from "./participant-diff";

describe("diffParticipants (classes.edit rule 9, PAD-842)", () => {
  // The class payload serialises a participant id as a number; the picker hands back a string.
  const loaded = [{ id: 834 }, { id: 901 }];

  it("[CLASSES-EDIT-22] unticking and re-ticking a student gives neither list", () => {
    const unticked = loaded.filter((p) => p.id !== 834);
    const reticked = [...unticked, { id: "834" }];
    expect(diffParticipants(loaded, reticked)).toEqual({ addPlayers: [], removePlayers: [] });
  });

  it("[CLASSES-EDIT-22] ticking a new student gives addPlayers with them alone", () => {
    expect(diffParticipants(loaded, [...loaded, { id: "777" }])).toEqual({ addPlayers: ["777"], removePlayers: [] });
    expect(diffParticipants(loaded, [{ id: 901 }])).toEqual({ addPlayers: [], removePlayers: ["834"] });
  });
});
