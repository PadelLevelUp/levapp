import { describe, expect, it } from "vitest";
import type { PresencePlayerStats, PresenceStatsTotals } from "@levelup/types";
import { chartScope, narrowedTotals } from "./presence-scope";

const player = (id: number, priv: number, academy: number): PresencePlayerStats => ({
  playerId: id,
  name: `P${id}`,
  total: priv + academy,
  private: priv,
  academy,
  justified: 0,
  unjustified: 0,
  invitesReceived: 0,
  invitesJoined: 0,
});

const base: PresenceStatsTotals = {
  presences: 10,
  activePlayers: 4,
  private: 4,
  academy: 6,
  academyShare: 60,
  guestAttendances: 1,
  justified: 1,
  unjustified: 2,
};

// attendance.validation rule 17a — "The charts follow the table filters"
describe("narrowedTotals", () => {
  it("sums the split over the visible rows only", () => {
    const totals = narrowedTotals([player(1, 1, 3)], base);
    expect(totals).toMatchObject({ private: 1, academy: 3, presences: 4, academyShare: 75 });
    // Untouched roster-wide fields survive.
    expect(totals?.activePlayers).toBe(4);
  });

  it("is an all-zero split when the filter matched nobody", () => {
    expect(narrowedTotals([], base)).toMatchObject({ private: 0, academy: 0, presences: 0, academyShare: 0 });
  });

  it("passes undefined through before the stats load", () => {
    expect(narrowedTotals([player(1, 1, 1)], undefined)).toBeUndefined();
  });
});

describe("chartScope", () => {
  it("is null with no filter and n-of-N otherwise", () => {
    const roster = [player(1, 1, 1), player(2, 2, 2)];
    expect(chartScope(null, roster)).toBeNull();
    expect(chartScope([roster[0]], roster)).toEqual({ shown: 1, total: 2 });
  });
});
