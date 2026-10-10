import { describe, expect, it } from "vitest";

import {
  DEFAULT_WAITING_LIST_PERIOD_CLASSES,
  WAITING_LIST_MAX_PERIOD_CLASSES,
  WAITING_LIST_SCOPE_KEYS,
  waitingListCandidates,
  waitingListDraftFor,
  waitingListOriginKey,
  waitingListPeriodValid,
  waitingListPickerOptions,
  waitingListRowIsManagedInSettings,
  waitingListScopeLabel,
  waitingListScopeOptions,
  waitingListScopeRequest,
  wholeSeriesEndPreview,
} from "./waiting-list-origin";

describe("PAD-547 class waiting list (calendar.event-detail rules 19–20)", () => {
  it("labels each origin", () => {
    expect(waitingListOriginKey({ origin: "standing", seriesScoped: false })).toBe("calendar.detail.waitingListOriginStanding");
    expect(waitingListOriginKey({ origin: "standing", seriesScoped: true })).toBe("calendar.detail.waitingListOriginStandingSeries");
    expect(waitingListOriginKey({ origin: "coach", seriesScoped: false })).toBe("calendar.detail.waitingListOriginCoach");
    expect(waitingListOriginKey({ origin: "student", seriesScoped: false })).toBe("calendar.detail.waitingListOriginStudent");
  });

  describe("PAD-560 each row says how long the student is on the list (rule 19)", () => {
    const fmt = (iso: string) => `<${iso}>`;

    it("names the scope, dating the dated ones through the caller's locale formatter", () => {
      expect(waitingListScopeLabel({ scope: "occurrence", expiresOn: null }, fmt)).toEqual({ key: "calendar.detail.waitingListScopeOccurrence" });
      expect(waitingListScopeLabel({ scope: "series", expiresOn: "2026-12-31" }, fmt)).toEqual({ key: "calendar.detail.waitingListScopeSeries" });
      expect(waitingListScopeLabel({ scope: "period", expiresOn: "2026-10-27" }, fmt)).toEqual({
        key: "calendar.detail.waitingListScopeUntil", params: { date: "<2026-10-27>" },
      });
      expect(waitingListScopeLabel({ scope: "standing", expiresOn: "2026-12-31" }, fmt)).toEqual({
        key: "calendar.detail.waitingListScopeUntil", params: { date: "<2026-12-31>" },
      });
      expect(waitingListScopeLabel({ scope: "standing", expiresOn: null }, fmt).params).toEqual({ date: "—" });
    });

    it("marks only a coach-wide standing row as managed in Settings", () => {
      expect(waitingListRowIsManagedInSettings({ scope: "standing" })).toBe(true);
      for (const scope of ["occurrence", "series", "period"] as const) expect(waitingListRowIsManagedInSettings({ scope })).toBe(false);
    });

    it("tells the coach the date a whole-series entry will run to: the series' end, capped at 12 months (rule 19)", () => {
      expect(wholeSeriesEndPreview("2026-12-31", "2026-10-09")).toBe("2026-12-31");
      expect(wholeSeriesEndPreview("2028-01-15", "2026-10-09")).toBe("2027-10-09");
      expect(wholeSeriesEndPreview(null, "2026-10-09")).toBe("2027-10-09");
      expect(wholeSeriesEndPreview("2026-01-01", "2026-10-09")).toBe("2027-10-09");
    });

    it("offers the series scopes only for a recurring class", () => {
      expect(waitingListScopeOptions(true)).toEqual(["occurrence", "series", "period"]);
      expect(waitingListScopeOptions(false)).toEqual(["occurrence"]);
    });

  });

  it("offers roster students not in the class and not already listed", () => {
    const roster = [{ playerId: 1 }, { playerId: 2 }, { playerId: "3" }, { playerId: 4 }];
    expect(waitingListCandidates(roster, ["1"], [{ playerId: 3 }]).map((p) => String(p.playerId))).toEqual(["2", "4"]);
  });

  describe("PAD-560 the dialog's scope logic, shared by both shells (rule 20)", () => {
    const today = new Date("2026-10-09T12:00:00Z");

    it("builds the request each scope asks for", () => {
      expect(waitingListScopeRequest("occurrence", "classes", 3, "2026-11-01")).toEqual({ scope: "occurrence" });
      expect(waitingListScopeRequest("series", "date", 3, "2026-11-01")).toEqual({ scope: "series" });
      expect(waitingListScopeRequest("period", "classes", 3, "2026-11-01")).toEqual({ scope: "period", classes: 3 });
      expect(waitingListScopeRequest("period", "date", 3, "2026-11-01")).toEqual({ scope: "period", expiresOn: "2026-11-01" });
    });

    it("validates only a period: a count in 1..52, or a date inside the standing window", () => {
      expect(waitingListPeriodValid("series", "classes", 0, "1999-01-01", today)).toBe(true);
      expect(waitingListPeriodValid("period", "classes", 0, "2026-11-01", today)).toBe(false);
      expect(waitingListPeriodValid("period", "classes", WAITING_LIST_MAX_PERIOD_CLASSES, "2026-11-01", today)).toBe(true);
      expect(waitingListPeriodValid("period", "classes", WAITING_LIST_MAX_PERIOD_CLASSES + 1, "2026-11-01", today)).toBe(false);
      expect(waitingListPeriodValid("period", "date", 1, "2026-11-01", today)).toBe(true);
      expect(waitingListPeriodValid("period", "date", 1, "2020-01-01", today)).toBe(false);
    });

    it("opens an edit on the row's scope and end, and an add on this class only", () => {
      expect(waitingListDraftFor(null, today)).toMatchObject({ scope: "occurrence", periodMode: "classes", classes: DEFAULT_WAITING_LIST_PERIOD_CLASSES });
      expect(waitingListDraftFor({ scope: "period", expiresOn: "2026-11-30" }, today)).toMatchObject({ scope: "period", periodMode: "date", expiresOn: "2026-11-30" });
      expect(waitingListDraftFor({ scope: "series", expiresOn: "2026-12-31" }, today)).toMatchObject({ scope: "series", periodMode: "classes" });
      expect(waitingListDraftFor({ scope: "standing", expiresOn: "2026-12-31" }, today).scope).toBe("occurrence");
      expect(WAITING_LIST_SCOPE_KEYS.period).toBe("calendar.detail.waitingListScopePeriod");
    });
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
