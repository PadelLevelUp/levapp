/**
 * D137 (messaging.push-notifications, "A push opened on the wrong account says so"):
 * a conversation fetch the server refuses with 403 means this account is not in the
 * thread — a push for another account, a stale link, a thread the user left. Both shells
 * say "This conversation belongs to another account" then (true in every 403 case), and
 * offer no retry, which could never succeed. Every other failure keeps the generic
 * "Could not load this conversation." with its retry.
 */
import { describe, expect, it } from "vitest";

import { canRetryThreadLoad, threadLoadErrorKey } from "./threadLoadError";

const axiosLike = (status: number) => ({ isAxiosError: true, response: { status } });

describe("threadLoadErrorKey", () => {
  it("names another account on a 403", () => {
    expect(threadLoadErrorKey(axiosLike(403))).toBe("messages.conversationBelongsToAnotherAccount");
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

describe("canRetryThreadLoad", () => {
  it("offers no retry on a 403 — it can never succeed", () => {
    expect(canRetryThreadLoad(axiosLike(403))).toBe(false);
  });

  it("offers a retry for every other failure", () => {
    expect(canRetryThreadLoad(axiosLike(500))).toBe(true);
    expect(canRetryThreadLoad(axiosLike(404))).toBe(true);
    expect(canRetryThreadLoad(new Error("Network Error"))).toBe(true);
    expect(canRetryThreadLoad(undefined)).toBe(true);
  });
});
