import { describe, expect, it } from "vitest";
import { coachDisplayName, nicknameShown, rosterNicknameOf } from "./coach-display-name";
import { searchRoster } from "./player-search";

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

describe("rosterNicknameOf (PAD-660: the nickname field the shared search rule takes)", () => {
  it("is the row's nickname, else a display name that differs from the real name, else null", () => {
    expect(rosterNicknameOf({ name: "Jorge Silva", nickname: "Outro", displayName: "Jorge Silva" })).toBe("Outro");
    expect(rosterNicknameOf({ name: "Jorge Silva", displayName: "Jorge chato" })).toBe("Jorge chato");
    expect(rosterNicknameOf({ name: "Ana", displayName: "Ana" })).toBeNull();
    expect(rosterNicknameOf({ name: "Ana", nickname: "  " })).toBeNull();
  });
});

describe("searchRoster finds a student by either name (PAD-660 + PAD-665)", () => {
  const rows = [
    { playerId: "7", name: "Jorge Silva", nickname: "Jorge chato", displayName: "Jorge chato" },
    { playerId: "9", name: "Ana Pinto" },
  ];
  it("matches the real name and the coach's nickname, and nothing else", () => {
    expect(searchRoster(rows, "silva").map((r) => r.playerId)).toEqual(["7"]);
    expect(searchRoster(rows, "chato").map((r) => r.playerId)).toEqual(["7"]);
    expect(searchRoster(rows, "pinto").map((r) => r.playerId)).toEqual(["9"]);
    expect(searchRoster(rows, "zzz")).toEqual([]);
  });
  it("a nickname kept off the name (switch off) still finds the student", () => {
    expect(searchRoster([{ playerId: 8, name: "Jorge Silva", nickname: "Outro", displayName: "Jorge Silva" }], "outro")).toHaveLength(1);
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
