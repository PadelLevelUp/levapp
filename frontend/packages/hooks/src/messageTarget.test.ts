/**
 * PAD-408 — messaging.push-notifications rule 12: opening a thread on a target
 * message loads older pages until the message is present (at most
 * MESSAGE_TARGET_MAX_OLDER_PAGES), then scrolls to it; not found within the
 * bound, or no older pages left, falls back to today's landing.
 */
import { describe, expect, it } from "vitest";

import { MESSAGE_TARGET_MAX_OLDER_PAGES, nextTargetStep, openingTarget } from "./messageTarget";

const ids = (...n: number[]) => n.map((id) => ({ id }));

describe("nextTargetStep", () => {
  it("scrolls to the message when it is loaded, giving its index", () => {
    expect(
      nextTargetStep({ messages: ids(10, 11, 12), targetId: 11, olderPagesLoaded: 0, hasOlder: true })
    ).toEqual({ kind: "scroll", index: 1 });
  });

  it("matches a string target against numeric ids", () => {
    expect(
      nextTargetStep({ messages: ids(10, 11), targetId: "10", olderPagesLoaded: 0, hasOlder: false })
    ).toEqual({ kind: "scroll", index: 0 });
  });

  it("asks for an older page while the message is missing and older pages remain", () => {
    expect(
      nextTargetStep({ messages: ids(40, 41), targetId: 5, olderPagesLoaded: 0, hasOlder: true })
    ).toEqual({ kind: "load-older" });
  });

  it("gives up when there is nothing older to load", () => {
    expect(
      nextTargetStep({ messages: ids(40, 41), targetId: 5, olderPagesLoaded: 2, hasOlder: false })
    ).toEqual({ kind: "give-up" });
  });

  it("gives up at the page bound even if older pages remain", () => {
    expect(MESSAGE_TARGET_MAX_OLDER_PAGES).toBe(10);
    expect(
      nextTargetStep({
        messages: ids(900),
        targetId: 5,
        olderPagesLoaded: MESSAGE_TARGET_MAX_OLDER_PAGES,
        hasOlder: true,
      })
    ).toEqual({ kind: "give-up" });
  });
});

/**
 * PAD-415 — messaging.conversation-detail rule 9a: an explicit `?message=`
 * target (a push tap, a deep link) wins over the thread's first unread
 * message; with neither, there is no target and the thread opens at the
 * newest message as before.
 */
describe("openingTarget", () => {
  it("uses the explicit target when one is given", () => {
    expect(openingTarget({ explicit: 58, firstUnread: 46 })).toBe("58");
  });

  it("falls back to the first unread message when there is no explicit target", () => {
    expect(openingTarget({ explicit: null, firstUnread: 46 })).toBe("46");
    expect(openingTarget({ explicit: undefined, firstUnread: "46" })).toBe("46");
  });

  it("treats an empty-string explicit target as absent", () => {
    expect(openingTarget({ explicit: "", firstUnread: 46 })).toBe("46");
  });

  it("is null when neither is present — the newest message, as before", () => {
    expect(openingTarget({ explicit: null, firstUnread: null })).toBeNull();
    expect(openingTarget({ explicit: undefined, firstUnread: undefined })).toBeNull();
  });
});
