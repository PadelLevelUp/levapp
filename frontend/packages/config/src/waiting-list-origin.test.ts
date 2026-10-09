import { describe, expect, it } from "vitest";

import {
  formatClubDay,
  waitingListCandidates,
  waitingListOriginKey,
  waitingListPickerOptions,
  waitingListRowIsManagedInSettings,
  waitingListScopeLabel,
} from "./waiting-list-origin";

describe("PAD-547 class waiting list (calendar.event-detail rules 19–20)", () => {
  it("labels each origin", () => {
    expect(waitingListOriginKey({ origin: "standing", seriesScoped: false })).toBe("calendar.detail.waitingListOriginStanding");
    expect(waitingListOriginKey({ origin: "standing", seriesScoped: true })).toBe("calendar.detail.waitingListOriginStandingSeries");
    expect(waitingListOriginKey({ origin: "coach", seriesScoped: false })).toBe("calendar.detail.waitingListOriginCoach");
    expect(waitingListOriginKey({ origin: "student", seriesScoped: false })).toBe("calendar.detail.waitingListOriginStudent");
  });

  describe("PAD-560 each row says how long the student is on the list (rule 19)", () => {
    it("names the scope, dating the dated ones as dd/mm/yyyy", () => {
      expect(waitingListScopeLabel({ scope: "occurrence", expiresOn: null })).toEqual({ key: "calendar.detail.waitingListScopeOccurrence" });
      expect(waitingListScopeLabel({ scope: "series", expiresOn: "2026-12-31" })).toEqual({ key: "calendar.detail.waitingListScopeSeries" });
      expect(waitingListScopeLabel({ scope: "period", expiresOn: "2026-10-27" })).toEqual({
        key: "calendar.detail.waitingListScopeUntil", params: { date: "27/10/2026" },
      });
      expect(waitingListScopeLabel({ scope: "standing", expiresOn: "2026-12-31" })).toEqual({
        key: "calendar.detail.waitingListScopeUntil", params: { date: "31/12/2026" },
      });
    });

    it("marks only a coach-wide standing row as managed in Settings", () => {
      expect(waitingListRowIsManagedInSettings({ scope: "standing" })).toBe(true);
      for (const scope of ["occurrence", "series", "period"] as const) expect(waitingListRowIsManagedInSettings({ scope })).toBe(false);
    });

    it("prints a club day and leaves anything else alone", () => {
      expect(formatClubDay("2026-01-05")).toBe("05/01/2026");
      expect(formatClubDay("")).toBe("");
    });
  });

  it("offers roster students not in the class and not already listed", () => {
    const roster = [{ playerId: 1 }, { playerId: 2 }, { playerId: "3" }, { playerId: 4 }];
    expect(waitingListCandidates(roster, ["1"], [{ playerId: 3 }]).map((p) => String(p.playerId))).toEqual(["2", "4"]);
  });

  describe("PAD-558 the picker searches by name (rule 20)", () => {
    const candidates = [
      { playerId: 1, name: "Álvaro Sousa" },
      { playerId: 2, name: "Ana Pinto" },
      { playerId: 3, name: "Bruno Álves" },
    ];
    const ids = (q: string, chosen: string | null = null) =>
      waitingListPickerOptions(candidates, q, chosen).map((p) => String(p.playerId));

    it("offers only the students whose name holds every typed word, in any order, ignoring accents", () => {
      expect(ids("sousa alv")).toEqual(["1"]);
      expect(ids("ALVES")).toEqual(["3"]);
    });

    it("offers everyone when the search is blank", () => {
      expect(ids("")).toEqual(["1", "2", "3"]);
      expect(ids("   ")).toEqual(["1", "2", "3"]);
    });

    it("keeps the chosen student listed, in roster order, even when the search no longer matches them", () => {
      expect(ids("pinto", "3")).toEqual(["2", "3"]);
      expect(ids("pinto", "2")).toEqual(["2"]);
    });
  });
});
