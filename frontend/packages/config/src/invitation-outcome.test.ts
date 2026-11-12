import { describe, expect, it } from "vitest";

import type { InvitationOutcome } from "@levelup/types";
import {
  INVITATION_OUTCOME_KEY,
  inviteeActionsFor,
  inviteeNotes,
  inviteeTierText,
  pendingInviteCount,
  outcomeAfterCoachAction,
  outcomeAfterResponse,
  statusForOutcome,
} from "./invitation-outcome";
import { localeT } from "./testkit/locale-t";

describe("PAD-548 invitee outcomes (calendar.event-detail rules 16–18)", () => {
  it("names every outcome with one calendar.detail key", () => {
    expect(Object.keys(INVITATION_OUTCOME_KEY).sort()).toEqual(
      ["accepted", "cancelled", "closed_same_hour", "declined", "expired", "not_counting", "pending", "sorry", "spot_filled", "withdrawn"],
    );
    expect(INVITATION_OUTCOME_KEY.withdrawn).toBe("calendar.detail.outcomeWithdrawn");
    expect(INVITATION_OUTCOME_KEY.pending).toBe("calendar.detail.outcomePending");
  });

  it("[CALENDAR-EVENT-DETAIL-19] offers actions only where rule 17 says", () => {
    expect(inviteeActionsFor("pending")).toEqual(["accept", "decline", "delete"]);
    expect(inviteeActionsFor("declined")).toEqual(["accept"]);
    for (const outcome of ["accepted", "withdrawn", "spot_filled", "expired"] as const) {
      expect(inviteeActionsFor(outcome)).toEqual([]);
    }
  });

  it("maps a live event's response to the row's outcome", () => {
    expect(outcomeAfterResponse("yes")).toBe("accepted");
    expect(outcomeAfterResponse("no")).toBe("declined");
    expect(outcomeAfterResponse("spot_filled")).toBe("spot_filled");
    expect(outcomeAfterResponse("withdrawn")).toBe("withdrawn");
    expect(outcomeAfterResponse("something_new")).toBeNull();
  });

  it("[CALENDAR-EVENT-DETAIL-19] maps a coach action's answer to the row's outcome", () => {
    expect(outcomeAfterCoachAction("confirmed")).toBe("accepted");
    expect(outcomeAfterCoachAction("declined")).toBe("declined");
    expect(outcomeAfterCoachAction("withdrawn")).toBe("withdrawn");
    expect(outcomeAfterCoachAction("spot_filled")).toBe("spot_filled");
    expect(outcomeAfterCoachAction("expired")).toBe("expired");
    expect(outcomeAfterCoachAction("unknown")).toBeNull();
  });

  it("keeps status in step with the outcome", () => {
    expect(statusForOutcome("accepted")).toBe("confirmed");
    expect(statusForOutcome("pending")).toBe("sent");
    expect(statusForOutcome("withdrawn")).toBe("expired");
  });
});

describe("PAD-719 invitee notes (calendar.event-detail rule 16)", () => {
  it("names a moved invitation, and only a moved one", () => {
    expect(inviteeNotes({ answeredBy: null, movedAt: "2026-10-22T03:00:00" })).toEqual([
      { id: "moved-from-spot", key: "calendar.detail.movedFromPreviousSpot" },
    ]);
    expect(inviteeNotes({ answeredBy: null, movedAt: null })).toEqual([]);
    expect(inviteeNotes({ answeredBy: "student" })).toEqual([]);
  });

  it("keeps the coach's note first when both apply", () => {
    expect(inviteeNotes({ answeredBy: "coach", movedAt: "2026-10-22T03:00:00" }).map((n) => n.id)).toEqual([
      "recorded-by-coach",
      "moved-from-spot",
    ]);
  });
});

describe("PAD-920 the new engine's invitee outcomes (calendar.event-detail ND1–ND3)", () => {
  const row = (outcome: InvitationOutcome) => ({ outcome });

  it("[CALENDAR-EVENT-DETAIL-34] pending counts only the invitations that still count", () => {
    const invitees = [
      row("pending"), row("pending"), row("pending"),
      row("not_counting"), row("not_counting"),
      row("accepted"), row("sorry"), row("closed_same_hour"), row("cancelled"), row("declined"),
    ];
    expect(pendingInviteCount(invitees)).toBe(3);
    // ND2 reuses today's line.
    expect(localeT("en")("calendar.detail.openSpotsPending", { count: 2, pending: 3 })).toBe("2 open, 3 pending");
  });

  it("[CALENDAR-EVENT-DETAIL-35] labels every new outcome in both locales, from the shared table", () => {
    for (const outcome of ["closed_same_hour", "sorry", "not_counting", "cancelled"] as const) {
      const key = INVITATION_OUTCOME_KEY[outcome];
      for (const lng of ["pt", "en"] as const) expect(localeT(lng)(key)).not.toBe(key);
    }
    expect(localeT("pt")(INVITATION_OUTCOME_KEY.not_counting)).toBe("Sem resposta · já não conta");
    expect(localeT("en")(INVITATION_OUTCOME_KEY.cancelled)).toBe("Accepted, then cancelled");
    // An invitation that stopped counting is still open: the coach can still record an answer.
    expect(inviteeActionsFor("not_counting")).toEqual(["accept", "decline", "delete"]);
    for (const closed of ["sorry", "closed_same_hour", "cancelled"] as const) expect(inviteeActionsFor(closed)).toEqual([]);
    expect(statusForOutcome("not_counting")).toBe("sent");
  });

  it("[CALENDAR-EVENT-DETAIL-35] notes a re-offered invitation as reopened, in place of the moved note", () => {
    expect(inviteeNotes({ answeredBy: null, reofferedAt: "2026-11-12T10:00:00" })).toEqual([
      { id: "reopened", key: "calendar.detail.reopened" },
    ]);
    expect(
      inviteeNotes({ answeredBy: "coach", movedAt: "2026-11-12T09:00:00", reofferedAt: "2026-11-12T10:00:00" }).map((n) => n.id),
    ).toEqual(["recorded-by-coach", "reopened"]);
  });

  it("[CALENDAR-EVENT-DETAIL-35] names where the invitation came from", () => {
    expect(inviteeTierText({})).toBeNull(); // an old-engine row
    expect(inviteeTierText({ tierSource: "coach_list" })).toEqual({ key: "calendar.detail.tierCoachList" });
    expect(inviteeTierText({ tierSource: "students_list" })).toEqual({ key: "calendar.detail.tierWaitingList" });
    const g = inviteeTierText({ tierSource: "pool", groupNumber: 2 })!;
    expect(localeT("pt")(g.key, g.params)).toBe("grupo 2");
    expect(localeT("en")(g.key, g.params)).toBe("group 2");
    const manual = inviteeTierText({ tierSource: null })!;
    expect(localeT("pt")(manual.key)).toBe("convite manual");
  });

  it("maps the new engine's coach answers, and leaves the old engine's untouched", () => {
    expect(outcomeAfterCoachAction("sorry")).toBe("sorry");
    expect(outcomeAfterCoachAction("closed_same_hour")).toBe("closed_same_hour");
    expect(outcomeAfterCoachAction("class_started")).toBe("expired");
    expect(outcomeAfterCoachAction("reoffered")).toBe("pending");
    expect(outcomeAfterResponse("spot_filled")).toBe("spot_filled");
    expect(outcomeAfterCoachAction("spot_filled")).toBe("spot_filled");
    expect(pendingInviteCount([row("pending"), row("spot_filled"), row("pending")])).toBe(2);
  });
});
