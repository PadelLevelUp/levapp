import { describe, expect, it } from "vitest";
import { firstUnreadDividerIndex, isFirstUnreadMessage } from "./unread-divider";

describe("isFirstUnreadMessage (PAD-415)", () => {
  it("matches the frozen first-unread id, string vs numeric alike", () => {
    expect(isFirstUnreadMessage(46, 46)).toBe(true);
    expect(isFirstUnreadMessage("46", 46)).toBe(true);
    expect(isFirstUnreadMessage(46, "46")).toBe(true);
  });

  it("is false for any other message", () => {
    expect(isFirstUnreadMessage(45, 46)).toBe(false);
  });

  it("is false once nothing is unread (null)", () => {
    expect(isFirstUnreadMessage(46, null)).toBe(false);
    expect(isFirstUnreadMessage(46, undefined)).toBe(false);
  });
});

describe("firstUnreadDividerIndex (PAD-415)", () => {
  const messages = [{ id: 44 }, { id: 45 }, { id: 46 }, { id: 47 }];

  it("finds the loaded row directly below where the divider renders", () => {
    expect(firstUnreadDividerIndex(messages, 46)).toBe(2);
  });

  it("is -1 when nothing is unread", () => {
    expect(firstUnreadDividerIndex(messages, null)).toBe(-1);
  });

  it("is -1 when the first-unread message has not loaded into this page", () => {
    expect(firstUnreadDividerIndex(messages, 5)).toBe(-1);
  });
});
