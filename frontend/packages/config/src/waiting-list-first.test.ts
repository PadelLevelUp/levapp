/**
 * PAD-446: the waiting list is asked first. `waitingListAskedFirst` is what both apps' "Understand
 * invites" tutorial shows (settings.tutorials rule 4.3); `queueBadgeLabel` is the chip next to a
 * player in the replacement-approval queue (notifications.semi-auto-approval rule 5), moved here so
 * web and iOS share one rule.
 */
import { describe, expect, it } from "vitest";
import { queueBadgeLabel, waitingListAskedFirst } from "./waiting-list-first";

describe("waitingListAskedFirst", () => {
  it("returns the server's group 0 in its order", () => {
    const list = [
      { playerId: "7", name: "Eva", standing: false, joinedAt: "2026-10-03T09:00:00" },
      { playerId: "8", name: "Dora", standing: true, joinedAt: "2026-10-03T10:00:00" },
    ];
    expect(waitingListAskedFirst({ waitingList: list }).map((e) => e.name)).toEqual(["Eva", "Dora"]);
  });

  it("is empty for a server older than PAD-446, which sends no waitingList", () => {
    expect(waitingListAskedFirst({})).toEqual([]);
  });
});

describe("queueBadgeLabel", () => {
  it("marks a waiting-list student, whatever their round number", () => {
    expect(queueBadgeLabel({ fromWaitingList: true, roundNumber: 0 })).toEqual({
      key: "notificationsUi.replacementApproval.waitingList",
    });
  });

  it("keeps the previous precedence for everyone else: label, then round, then group", () => {
    expect(queueBadgeLabel({ groupLabel: "Terça 19h", roundNumber: 2, groupIndex: 1 })).toEqual({ text: "Terça 19h" });
    expect(queueBadgeLabel({ roundNumber: 2, groupIndex: 1 })).toEqual({
      key: "notificationsUi.replacementApproval.round",
      params: { number: 2 },
    });
    expect(queueBadgeLabel({ groupIndex: 3 })).toEqual({
      key: "notificationsUi.replacementApproval.group",
      params: { index: 3 },
    });
    expect(queueBadgeLabel({})).toBeNull();
  });
});
