import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-577 (notifications.invitations rule 15a) on iOS: a lost spot offers that class's waiting list
 * from the message. The bubble mounts gestures and the API layer the unit harness cannot, so this
 * pins the wiring tokens; the offer rule is tested in `@levelup/config` `invitation-waiting-list`
 * and the web bubble test exercises the same states end to end.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUBBLE = fs.readFileSync(path.join(HERE, "message-bubble.tsx"), "utf8");

describe("the iOS invitation bubble offers the waiting list for a lost spot (PAD-577)", () => {
  it("decides with the shared rule, on the student's own lists, only for a received invitation", () => {
    expect(BUBBLE).toContain("const lostToAnother = isInvite && !own && invitationLostToAnother(message.metadata);");
    expect(BUBBLE).toContain("queryFn: academyClassesApi.listClassWaitingList");
    expect(BUBBLE).toContain("offersWaitingListJoin(message.metadata, { nowWallMs: lisbonNowMs(), onWaitingList: onInviteWaitingList })");
  });

  it("joins that occurrence through the student's own join, and leaves through its leave", () => {
    expect(BUBBLE).toContain('academyClassesApi.joinClassWaitingList({ model: "LessonInstance", originalId: inviteInstanceId })');
    expect(BUBBLE).toContain("academyClassesApi.leaveClassWaitingList(inviteInstanceId)");
  });

  it("carries the ids web uses, next to the spot-filled badge", () => {
    for (const id of ["invite-join-waiting-list", "invite-on-waiting-list", "invite-leave-waiting-list"]) {
      expect(BUBBLE).toContain(`testID="${id}"`);
    }
    for (const key of ["joinWaitingList", "onWaitingList", "leaveWaitingList", "joinWaitingListFailed"]) {
      expect(BUBBLE).toContain(`messages.${key}`);
    }
  });
});
