/**
 * classes.coach-requests-table rules 5, 7, 11, 12 (PAD-795): the coach's table view — tab, sort and
 * filters — and the request both shells send for it. One function builds the query for web (from its
 * URL) and iOS (from its "Filtrar/Ordenar" sheet), so the two send the same params for the same choices.
 */
import { describe, expect, it } from "vitest";
import {
  COACH_REQUESTS_DEFAULT_SORT,
  COACH_REQUESTS_SECTION_STATUSES,
  coachRequestsActiveSort,
  coachRequestsQuery,
  switchCoachRequestsSection,
} from "./coach-requests-view";

describe("the coach's requests view (PAD-795)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-13] a view becomes the endpoint's query, page 1 unless told otherwise", () => {
    expect(coachRequestsQuery({ section: "open" })).toEqual({ section: "open", page: 1 });
    expect(
      coachRequestsQuery(
        { section: "history", sortBy: "student", sortDir: "desc", kind: "academy", status: "accepted", side: "none", playerId: "bruno-id", classFrom: "2026-10-01", classTimeTo: "20:00", requestedFrom: "2026-09-01" },
        3
      )
    ).toEqual({
      section: "history", page: 3, sortBy: "student", sortDir: "desc", kind: "academy", status: ["accepted"], side: "none",
      playerId: "bruno-id", classFrom: "2026-10-01", classTimeTo: "20:00", requestedFrom: "2026-09-01",
    });
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-13] empty values are left out, a sort key alone sorts ascending", () => {
    const q = coachRequestsQuery({ section: "open", sortBy: "kind", kind: undefined, status: "", classTo: "" });
    expect(q).toEqual({ section: "open", page: 1, sortBy: "kind", sortDir: "asc" });
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-5] each section opens on its own default sort", () => {
    expect(COACH_REQUESTS_DEFAULT_SORT).toEqual({ open: { by: "class_date", dir: "asc" }, history: { by: "requested_at", dir: "desc" } });
    expect(coachRequestsActiveSort({ section: "history" })).toEqual({ by: "requested_at", dir: "desc" });
    expect(coachRequestsActiveSort({ section: "open", sortBy: "side" })).toEqual({ by: "side", dir: "asc" });
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-13] a tab change drops the status filter and keeps the rest", () => {
    expect(COACH_REQUESTS_SECTION_STATUSES.open).toEqual(["pending", "countered"]);
    expect(COACH_REQUESTS_SECTION_STATUSES.history).toEqual(["accepted", "declined", "rejected", "withdrawn", "superseded"]);
    const next = switchCoachRequestsSection({ section: "history", status: "accepted", kind: "private", sortBy: "student" }, "open");
    expect(next).toEqual({ section: "open", kind: "private", sortBy: "student" });
  });
});
