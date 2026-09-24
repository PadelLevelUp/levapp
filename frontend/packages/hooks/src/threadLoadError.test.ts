/**
 * D137 (messaging.push-notifications, "A push opened on the wrong account says so"):
 * a conversation fetch the server refuses with 403 means this account is not in the
 * thread — typically a push that reached the phone for another account. Both shells
 * show "This notification belongs to another account" then, and keep the generic
 * "Could not load this conversation." for every other failure.
 */
import { describe, expect, it } from "vitest";

import { threadLoadErrorKey } from "./threadLoadError";

const axiosLike = (status: number) => ({ isAxiosError: true, response: { status } });

describe("threadLoadErrorKey", () => {
  it("names another account on a 403", () => {
    expect(threadLoadErrorKey(axiosLike(403))).toBe("messages.notificationForAnotherAccount");
  });

  it("keeps the generic message for other statuses", () => {
    expect(threadLoadErrorKey(axiosLike(404))).toBe("messages.couldNotLoadConversation");
    expect(threadLoadErrorKey(axiosLike(500))).toBe("messages.couldNotLoadConversation");
  });

  it("keeps the generic message for a network error or anything unknown", () => {
    expect(threadLoadErrorKey(new Error("Network Error"))).toBe("messages.couldNotLoadConversation");
    expect(threadLoadErrorKey(undefined)).toBe("messages.couldNotLoadConversation");
    expect(threadLoadErrorKey(null)).toBe("messages.couldNotLoadConversation");
  });
});
