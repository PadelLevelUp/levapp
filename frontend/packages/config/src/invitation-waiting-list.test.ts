import { describe, expect, it } from "vitest";

import { invitationClassStillAhead, invitationLostToAnother, offersWaitingListJoin } from "./invitation-waiting-list";

const NOW = Date.parse("2026-10-16T17:00:00Z"); // "wall clock" ms, as lisbonNowMs gives
const lost = { responded: true, response: "spot_filled", lessonInstanceId: 7, startsAt: "2026-10-17T18:00:00" };

describe("PAD-577 a retired invitation offers the waiting list (invitations rule 15a)", () => {
  it("offers it only for a spot someone else took", () => {
    expect(invitationLostToAnother(lost)).toBe(true);
    for (const response of ["expired", "withdrawn", "no", "yes"]) {
      expect(invitationLostToAnother({ ...lost, response })).toBe(false);
    }
    expect(invitationLostToAnother({ ...lost, responded: false })).toBe(false);
    expect(invitationLostToAnother(undefined)).toBe(false);
  });

  it("offers it while the class is still ahead; an older message without startsAt is left to the server", () => {
    expect(invitationClassStillAhead(lost, NOW)).toBe(true);
    expect(invitationClassStillAhead({ ...lost, startsAt: "2026-10-16T16:00:00" }, NOW)).toBe(false);
    expect(invitationClassStillAhead({ ...lost, startsAt: null }, NOW)).toBe(true);
    expect(invitationClassStillAhead({ ...lost, startsAt: "garbage" }, NOW)).toBe(true);
  });

  it("never offers it to a student already on that class's list, and needs the class id", () => {
    expect(offersWaitingListJoin(lost, { nowWallMs: NOW, onWaitingList: false })).toBe(true);
    expect(offersWaitingListJoin(lost, { nowWallMs: NOW, onWaitingList: true })).toBe(false);
    expect(offersWaitingListJoin({ ...lost, lessonInstanceId: null }, { nowWallMs: NOW, onWaitingList: false })).toBe(false);
    expect(offersWaitingListJoin({ ...lost, startsAt: "2026-10-16T16:59:00" }, { nowWallMs: NOW, onWaitingList: false })).toBe(false);
  });
});
