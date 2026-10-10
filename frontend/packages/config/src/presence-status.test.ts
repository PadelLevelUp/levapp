import { describe, expect, it } from "vitest";

import type { PendingValidationPlayer } from "@levelup/types";
import {
  clearsFor,
  effectiveMark,
  presentCount,
  fromMark,
  prefillMark,
  toMark,
  undecidedCount,
  presentCount,
  presenceMarkTone,
  validationGroup,
} from "./presence-status";

function player(
  overrides: Partial<PendingValidationPlayer> = {}
): PendingValidationPlayer {
  return {
    presenceId: 1,
    playerId: 1,
    name: "Ana",
    response: "none",
    status: null,
    justification: null,
    validated: false,
    lateCancellation: false,
    guest: false,
    ...overrides,
  };
}

describe("status <-> mark mapping", () => {
  it("round-trips every mark through the two stored columns", () => {
    for (const mark of ["present", "justified", "unjustified"] as const) {
      const stored = fromMark(mark);
      expect(toMark(stored.status, stored.justification ?? null)).toBe(mark);
    }
  });

  it("treats an absence with no justification as unjustified", () => {
    // Matches AttendanceRow's default in the class-detail sheet, so the two
    // surfaces agree on what a bare `status: absent` row means.
    expect(toMark("absent", null)).toBe("unjustified");
  });

  it("reports an unanswered row as undecided", () => {
    expect(toMark(null, null)).toBeNull();
  });
});

describe("prefill", () => {
  it("assumes a self-declared absence is justified", () => {
    // A policy choice, not a mechanical mapping: `unjustified_absences` feeds
    // the eligibility bar, so this default is deliberately the generous one.
    expect(prefillMark("declined")).toBe("justified");
  });

  it("assumes a confirmed player turned up", () => {
    expect(prefillMark("confirmed")).toBe("present");
  });

  it("refuses to guess when nobody answered", () => {
    expect(prefillMark("none")).toBeNull();
  });
});

describe("PAD-567: a cleared mark (attendance.validation rule 26)", () => {
  const stored = { playerId: 1, name: "Ana", status: "present", justification: null, response: "confirmed" } as never;
  it("a null edit beats the stored mark and reads as undecided", () => {
    expect(effectiveMark(stored, null)).toBeNull();
    expect(undecidedCount([stored], { 1: null })).toBe(1);
    expect(presentCount([stored], { 1: null })).toBe(0);
  });
  it("an absent edit (undefined) still falls back to what is stored", () => {
    expect(effectiveMark(stored, undefined)).toBe("present");
  });
  it("clearsFor names the rows that had a mark on the server and lost it locally", () => {
    const server = [
      { playerId: "1", status: "present", justification: null },
      { playerId: "2", status: "absent", justification: "justified" },
      { playerId: "3", status: null, justification: null },
    ] as never;
    const local = { "1": { status: null }, "2": { status: "absent", justification: "justified" }, "3": { status: null } } as never;
    expect(clearsFor(server, local)).toEqual(["1"]);
  });
  it("clearsFor says which cleared rows were absences — the ones that may overfill the class", () => {
    const server = [{ playerId: "2", status: "absent", justification: "unjustified" }] as never;
    expect(clearsFor(server, { "2": { status: null } } as never, { absencesOnly: true })).toEqual(["2"]);
    expect(clearsFor([{ playerId: "1", status: "present", justification: null }] as never, { "1": { status: null } } as never, { absencesOnly: true })).toEqual([]);
  });
});

describe("effectiveMark precedence", () => {
  it("prefers the coach's edit over everything else", () => {
    const p = player({ response: "confirmed", status: "absent" });
    expect(effectiveMark(p, "unjustified")).toBe("unjustified");
  });

  it("falls back to what is already stored", () => {
    const p = player({ response: "confirmed", status: "absent", justification: "justified" });
    expect(effectiveMark(p, undefined)).toBe("justified");
  });

  it("falls back to the prefill when nothing is stored", () => {
    const p = player({ response: "confirmed" });
    expect(effectiveMark(p, undefined)).toBe("present");
  });

  it("stays undecided for an unanswered player with nothing stored", () => {
    expect(effectiveMark(player(), undefined)).toBeNull();
  });
});

describe("undecidedCount", () => {
  const players = [
    player({ playerId: 1, response: "confirmed" }),
    player({ playerId: 2, response: "declined" }),
    player({ playerId: 3, response: "none" }),
  ];

  it("counts only players with no determination", () => {
    // The first two are prefilled, so only the silent one blocks validation.
    expect(undecidedCount(players, {})).toBe(1);
  });

  it("clears once the coach decides the last one", () => {
    expect(undecidedCount(players, { 3: "present" })).toBe(0);
  });
});

describe("validationGroup (PAD-442)", () => {
  it("groups by the server's state: a silent player means needs-input", () => {
    expect(validationGroup([player({ playerId: 1, response: "none" })])).toBe("needsInput");
  });

  it("a class whose players all answered is ready", () => {
    expect(
      validationGroup([
        player({ playerId: 1, response: "confirmed" }),
        player({ playerId: 2, response: "declined" }),
      ])
    ).toBe("ready");
  });

  it("a stored status decides the player", () => {
    expect(validationGroup([player({ playerId: 1, response: "none", status: "present" })])).toBe("ready");
  });
});

describe("presenceMarkTone (PAD-441)", () => {
  it("gives each mark its own tone: present green, justified amber, unjustified red", () => {
    expect(presenceMarkTone("present")).toBe("positive");
    expect(presenceMarkTone("justified")).toBe("warning");
    expect(presenceMarkTone("unjustified")).toBe("negative");
  });
});

describe("presentCount (PAD-538, attendance.validation rule 27)", () => {
  const players = [
    player({ playerId: 1, response: "confirmed" }), // prefill: present
    player({ playerId: 2, response: "declined" }), // prefill: justified
    player({ playerId: 3, status: "present", validated: true }), // stored: present
    player({ playerId: 4 }), // undecided
  ];

  it("counts the rows the coach would see marked present", () => {
    expect(presentCount(players, {})).toBe(2);
  });

  it("follows the coach's local marks, both ways", () => {
    expect(presentCount(players, { 4: "present" })).toBe(3);
    expect(presentCount(players, { 1: "unjustified" })).toBe(1);
  });

  it("a stored mark outranks the prefill: confirmed but stored absent is not present", () => {
    expect(presentCount([player({ response: "confirmed", status: "absent", justification: "justified" })], {})).toBe(0);
  });

  it("a local edit outranks a stored mark: stored present flipped to unjustified is not present", () => {
    expect(presentCount([player({ playerId: 7, status: "present", validated: true })], { 7: "unjustified" })).toBe(0);
  });

  it("is 0 for a class with nobody present", () => {
    expect(presentCount([player({ response: "declined" })], {})).toBe(0);
  });
});

