import { describe, expect, it } from "vitest";
import {
  displayStateOf,
  groupOfState,
  groupParticipants,
  presenceChangedFor,
  classHasEnded,
} from "./participant-groups";

/**
 * PAD-659 / PAD-663 — `calendar.event-detail` rules 22, 24 and 25.
 *
 * The coach's participant list is grouped by what each student will do (Vão,
 * Por responder, Não vão), ordered by side then name, and computed here once so
 * the web and mobile lists cannot disagree. A coach's own mark is stored
 * validated (`attended` / `missed`), which is why the old rows read "Presente"
 * for a class that had not happened yet; before a class ends that mark is the
 * same intent as a student's "Vou".
 */

type Side = "left" | "right" | "both";

function player(id: number, name: string) {
  return { id: String(id), userId: String(100 + id), user: { id: String(100 + id), name, abbreviation: "" } };
}

function presence(playerId: number, attendanceState: string) {
  return { id: String(1000 + playerId), playerId: String(playerId), attendanceState };
}

function rosterEntry(playerId: number, name: string, side?: Side, level?: string) {
  return {
    id: String(500 + playerId),
    playerId: String(playerId),
    name,
    side,
    level: level ? { id: "l", label: level } : undefined,
  };
}

function build(rows: Array<[number, string, string, Side | undefined]>) {
  return {
    participants: rows.map(([id, name]) => player(id, name)),
    presences: rows.map(([id, , state]) => presence(id, state)),
    roster: rows.map(([id, name, , side]) => rosterEntry(id, name, side)),
  };
}

const names = (g: { rows: Array<{ name: string }> }) => g.rows.map((r) => r.name);

describe("groupParticipants (rule 22)", () => {
  it("orders the groups going, pending, not going and leaves an empty one out", () => {
    const groups = groupParticipants(
      build([
        [1, "Ana", "not_coming", "left"],
        [2, "Bruno", "coming", "left"],
        [3, "Carla", "not_coming", "left"],
      ])
    );
    expect(groups.map((g) => g.key)).toEqual(["going", "not_going"]);
    expect(names(groups[0])).toEqual(["Bruno"]);
    expect(names(groups[1])).toEqual(["Ana", "Carla"]);
  });

  it("puts a coach's validated mark in the intent groups: attended is going, missed is not going", () => {
    const groups = groupParticipants(
      build([
        [1, "Ana", "attended", "left"],
        [2, "Bruno", "planned", "left"],
        [3, "Carla", "missed", "left"],
      ])
    );
    expect(groups.map((g) => [g.key, names(g)])).toEqual([
      ["going", ["Ana"]],
      ["pending", ["Bruno"]],
      ["not_going", ["Carla"]],
    ]);
  });

  it("orders a group by side (both, right, left, none) and then by name in Portuguese", () => {
    const groups = groupParticipants(
      build([
        [1, "Zé Esquerdo", "planned", "left"],
        [2, "Bruno", "planned", "right"],
        [3, "Álvaro", "planned", "right"],
        [4, "Sem Lado", "planned", undefined],
        [5, "Nuno", "planned", "both"],
        [6, "Alberto", "planned", "right"],
      ])
    );
    expect(groups).toHaveLength(1);
    // "Álvaro" collates between "Alberto" and "Bruno", not after "Z" as a code-point sort puts it.
    expect(names(groups[0])).toEqual(["Nuno", "Alberto", "Álvaro", "Bruno", "Zé Esquerdo", "Sem Lado"]);
  });

  it("reads side and level from the coach's roster, and a player off the roster sorts with no side", () => {
    const data = build([
      [1, "Ana", "coming", "both"],
      [2, "Bruno", "coming", "left"],
    ]);
    data.roster = [rosterEntry(2, "Bruno", "left", "3+")];
    const [going] = groupParticipants(data);
    expect(going.rows.map((r) => [r.name, r.side, r.level?.label ?? null])).toEqual([
      ["Bruno", "left", "3+"],
      ["Ana", null, null],
    ]);
  });

  it("keeps the stored state on each row so a test can still read it", () => {
    const [going] = groupParticipants(build([[1, "Ana", "attended", "left"]]));
    expect(going.rows[0].state).toBe("attended");
    expect(going.rows[0].playerId).toBe("1");
  });

  it("a participant with no presence row is pending", () => {
    const data = build([[1, "Ana", "planned", "left"]]);
    data.presences = [];
    const groups = groupParticipants(data);
    expect(groups.map((g) => g.key)).toEqual(["pending"]);
  });

  it("maps each state to its group", () => {
    expect(["planned", "coming", "not_coming", "attended", "missed"].map((s) => groupOfState(s as never))).toEqual([
      "pending",
      "going",
      "not_going",
      "going",
      "not_going",
    ]);
  });
});

describe("displayStateOf (rule 25, PAD-663)", () => {
  it("before the class ends, a coach's mark reads as the intent", () => {
    expect(displayStateOf("attended", false)).toBe("coming");
    expect(displayStateOf("missed", false)).toBe("not_coming");
  });

  it("after the class ends, the record keeps its own word", () => {
    expect(displayStateOf("attended", true)).toBe("attended");
    expect(displayStateOf("missed", true)).toBe("missed");
  });

  it("leaves the intent states alone either way", () => {
    for (const ended of [false, true]) {
      expect(displayStateOf("planned", ended)).toBe("planned");
      expect(displayStateOf("coming", ended)).toBe("coming");
      expect(displayStateOf("not_coming", ended)).toBe("not_coming");
    }
  });
});

describe("presenceChangedFor (rule 24)", () => {
  const evt = (lessonInstanceId: unknown, type = "presence_changed") => ({
    type,
    payload: { lessonInstanceId, playerId: 7 },
  });

  it("is true for the open class, whether the id is a number or a string", () => {
    expect(presenceChangedFor(evt(42), 42)).toBe(true);
    expect(presenceChangedFor(evt(42), "42")).toBe(true);
    expect(presenceChangedFor(evt("42"), 42)).toBe(true);
  });

  it("is false for another class, another event, or nothing open", () => {
    expect(presenceChangedFor(evt(43), 42)).toBe(false);
    expect(presenceChangedFor(evt(42, "message_created"), 42)).toBe(false);
    expect(presenceChangedFor(evt(42), null)).toBe(false);
    expect(presenceChangedFor(null, 42)).toBe(false);
    expect(presenceChangedFor({ type: "presence_changed" }, 42)).toBe(false);
  });
});

describe("classHasEnded + displayStateOf on each side of the end (rule 25, pinned clock)", () => {
  // A class on 2026-10-20 ending 21:30 club time. Lisbon is UTC+1 (WEST) on that date, so the
  // end is 20:30Z. Both the fixture and "now" are pinned (memory: pinned-now tests must pin
  // their fixtures).
  const date = "2026-10-20";
  const endTime = "21:30";

  it("one minute before the end, a coach's present mark reads as Vai", () => {
    const now = new Date("2026-10-20T20:29:00Z");
    expect(classHasEnded(date, endTime, now)).toBe(false);
    expect(displayStateOf("attended", classHasEnded(date, endTime, now))).toBe("coming");
    expect(displayStateOf("missed", classHasEnded(date, endTime, now))).toBe("not_coming");
  });

  it("one minute after the end, the record keeps Presente / Faltou", () => {
    const now = new Date("2026-10-20T20:31:00Z");
    expect(classHasEnded(date, endTime, now)).toBe(true);
    expect(displayStateOf("attended", classHasEnded(date, endTime, now))).toBe("attended");
    expect(displayStateOf("missed", classHasEnded(date, endTime, now))).toBe("missed");
  });

  it("a midnight end (24:00) is the end of that day, and an unreadable time is not ended", () => {
    expect(classHasEnded(date, "24:00", new Date("2026-10-20T22:59:00Z"))).toBe(false);
    expect(classHasEnded(date, "24:00", new Date("2026-10-20T23:01:00Z"))).toBe(true);
    expect(classHasEnded(date, "", new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
