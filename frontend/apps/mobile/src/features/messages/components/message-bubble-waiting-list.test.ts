import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-577 (notifications.invitations rule 15a) on iOS: a lost spot offers that class's waiting list
 * from the message. The bubble mounts gestures and the API layer the unit harness cannot, so this
 * pins the wiring tokens; the states are tested in `@levelup/hooks` `useInviteWaitingList`, the
 * offer rule in `@levelup/config` `invitation-waiting-list`, and the web bubble test renders them.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUBBLE = fs.readFileSync(path.join(HERE, "message-bubble.tsx"), "utf8");

describe("the iOS invitation bubble offers the waiting list for a lost spot (PAD-577)", () => {
  it("runs the shared hook on the student's own API module, only for a received invitation", () => {
    expect(BUBBLE).toContain("useInviteWaitingList({");
    expect(BUBBLE).toContain("received: isInvite && !own,");
    expect(BUBBLE).toContain("list: academyClassesApi.listClassWaitingList,");
    expect(BUBBLE).toContain("join: academyClassesApi.joinClassWaitingList,");
    expect(BUBBLE).toContain("leave: academyClassesApi.leaveClassWaitingList,");
  });

  it("carries the ids web uses, next to the spot-filled badge", () => {
    for (const id of ["invite-join-waiting-list", "invite-on-waiting-list", "invite-leave-waiting-list"]) {
      expect(BUBBLE).toContain(`testID="${id}"`);
    }
    for (const key of ["joinWaitingList", "onWaitingList", "leaveWaitingList"]) {
      expect(BUBBLE).toContain(`messages.${key}`);
    }
  });
});
