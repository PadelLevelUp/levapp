import { describe, expect, it } from "vitest";
import { coachDisplayName, nicknameShown, rosterNameMatchesQuery } from "./coach-display-name";

/**
 * PAD-660 (`players.nickname` rule 3): every coach view resolves a student's name from the
 * coach's OWN roster — the server sends `displayName` only on the requesting coach's roster rows,
 * so a view that reads a shared payload (the class detail is readable by club colleagues) asks
 * here instead of trusting `player.user.name`.
 */
const roster = [
  { playerId: "7", name: "Jorge Silva", nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato" },
  { playerId: 8, name: "Jorge Silva", nickname: "Outro", nicknameAsName: false, displayName: "Jorge Silva" },
];

describe("coachDisplayName", () => {
  it("returns the roster row's display name for a player on the coach's roster", () => {
    expect(coachDisplayName(roster, 7, "Jorge Silva")).toBe("Jorge chato");
    expect(coachDisplayName(roster, "7", "x")).toBe("Jorge chato");
  });

  it("is the real name when the switch is off, and the fallback off the roster or without one", () => {
    expect(coachDisplayName(roster, "8", "Jorge Silva")).toBe("Jorge Silva");
    expect(coachDisplayName(roster, "99", "Ana")).toBe("Ana");
    expect(coachDisplayName(undefined, "7", "Jorge Silva")).toBe("Jorge Silva");
  });

  it("an older server without displayName falls back to the real name", () => {
    expect(coachDisplayName([{ playerId: "7", name: "Jorge Silva" }], "7", "Jorge Silva")).toBe("Jorge Silva");
  });
});

describe("nicknameShown", () => {
  it("is true only when the nickname is set and shown as the name", () => {
    expect(nicknameShown(roster[0])).toBe(true);
    expect(nicknameShown(roster[1])).toBe(false);
    expect(nicknameShown({ nickname: "  ", nicknameAsName: true })).toBe(false);
    expect(nicknameShown(null)).toBe(false);
  });
});

describe("rosterNameMatchesQuery (PAD-660: pickers find a student by either name)", () => {
  const row = { playerId: "7", name: "Jorge Silva", displayName: "Jorge chato" };
  it("matches the real name and the coach's display name", () => {
    expect(rosterNameMatchesQuery(row, "silva")).toBe(true);
    expect(rosterNameMatchesQuery(row, "chato")).toBe(true);
    expect(rosterNameMatchesQuery(row, "pinto")).toBe(false);
  });
  it("a row without a display name matches on the real name only", () => {
    expect(rosterNameMatchesQuery({ playerId: 1, name: "Ana" }, "ana")).toBe(true);
    expect(rosterNameMatchesQuery({ playerId: 1, name: "Ana" }, "chato")).toBe(false);
  });
});

describe("waitingListPickerOptions finds a candidate by the coach's nickname too", () => {
  it("offers the nicknamed student for a search on the nickname", async () => {
    const { waitingListPickerOptions } = await import("./waiting-list-origin");
    const candidates = [
      { playerId: 7, name: "Jorge Silva", displayName: "Jorge chato" },
      { playerId: 8, name: "Ana Pinto" },
    ];
    expect(waitingListPickerOptions(candidates, "chato", null).map((c) => c.playerId)).toEqual([7]);
  });
});
