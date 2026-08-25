import { describe, expect, it } from "vitest";

import type { PendingValidationPlayer } from "@/types";
import {
  effectiveMark,
  fromMark,
  prefillMark,
  toMark,
  undecidedCount,
} from "./presenceStatus";

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
