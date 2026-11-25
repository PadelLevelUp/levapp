import { describe, expect, it } from "vitest";
import { INVITE_NAMES_INVITER, INVITE_PAGES_TU, inviteCopyKey, invitePreviewNames } from "./invite-welcome";

/**
 * auth.invite-welcome open questions (owner, asked 2026-11-25): two points built on the stream lead's pick behind one
 * constant each, so the other answer is a one-line change. Each value is tested.
 */
describe("the invite pages' two pending owner points", () => {
  it("[AUTH-INVITE-WELCOME-3] a student's invite names the coach and the club only when the pick is yes and the preview carries them", () => {
    expect(INVITE_NAMES_INVITER).toBe(true);
    const preview = { playerName: "Ana", coachName: "Coach", clubName: "Club", email: "LEAK" };
    expect(invitePreviewNames(preview, true)).toEqual({ coach: "Coach", club: "Club" });
    // The answer "no": nothing is added, whatever the preview carries.
    expect(invitePreviewNames(preview, false)).toBeUndefined();
    // Today's preview does not carry them: nothing shows either way.
    expect(invitePreviewNames({ playerName: "Ana" }, true)).toBeUndefined();
    expect(invitePreviewNames({ playerName: "Ana", coachName: "Coach" }, true)).toBeUndefined();
  });

  it("[AUTH-INVITE-WELCOME-4] the two invite pages say tu in Portuguese when the pick is yes, and keep você when it is no", () => {
    expect(INVITE_PAGES_TU).toBe(true);
    expect(inviteCopyKey("auth.playerInvite.title", "pt", true)).toBe("auth.playerInvite.titleTu");
    expect(inviteCopyKey("auth.playerInvite.title", "pt-PT", true)).toBe("auth.playerInvite.titleTu");
    // The answer "no", and every other language: the words they have today.
    expect(inviteCopyKey("auth.playerInvite.title", "pt", false)).toBe("auth.playerInvite.title");
    expect(inviteCopyKey("auth.playerInvite.title", "en", true)).toBe("auth.playerInvite.title");
  });
});
