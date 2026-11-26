// classes.coach-requests-table (PAD-795) rules 3-7: the params the endpoint reads.
import { describe, expect, it } from "vitest";
import { coachRequestsParams } from "./coachRequests";

describe("coachRequestsParams", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-7] names every filter and sort as the endpoint reads it", () => {
    expect(
      coachRequestsParams({
        section: "history", page: 2, perPage: 50, sortBy: "student", sortDir: "desc", kind: "academy",
        status: ["accepted", "rejected"], side: "none", classFrom: "2026-12-01", classTo: "2026-12-31",
        classTimeFrom: "09:00", classTimeTo: "11:00", requestedFrom: "2026-11-01", requestedTo: "2026-11-30",
        playerId: 7, search: "rita", id: 3,
      }),
    ).toEqual({
      section: "history", page: 2, per_page: 50, sort_by: "student", sort_dir: "desc", kind: "academy",
      status: "accepted,rejected", side: "none", class_from: "2026-12-01", class_to: "2026-12-31",
      class_time_from: "09:00", class_time_to: "11:00", requested_from: "2026-11-01", requested_to: "2026-11-30",
      player_id: 7, search: "rita", id: 3,
    });
  });

  it("leaves unset and empty values out", () => {
    expect(coachRequestsParams({})).toEqual({});
    expect(coachRequestsParams({ section: "open", status: [], classFrom: "" })).toEqual({ section: "open" });
  });
});
