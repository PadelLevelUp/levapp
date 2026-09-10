/**
 * PAD-240 — push tap routing (messaging.push-notifications rule 7).
 *
 * A message-backed push must land in the conversation thread even when it
 * also carries a class id as context; the class route is only for pushes
 * typed `class` with no message behind them.
 */
import { describe, expect, it } from "vitest";

import { routeForPushData } from "./push-routing";

describe("routeForPushData", () => {
  it("routes a message push to its conversation", () => {
    expect(routeForPushData({ type: "message", conversationId: "12" })).toBe(
      "/conversation/12"
    );
  });

  it("keeps a message push in the thread even when a class id rides along", () => {
    expect(
      routeForPushData({
        type: "message",
        conversationId: 7,
        classInstanceId: 99,
      })
    ).toBe("/conversation/7");
  });

  it("routes a class push to the class", () => {
    expect(routeForPushData({ type: "class", classInstanceId: "5" })).toBe(
      "/class/5"
    );
  });

  it("never routes on a class id without the class type (the PAD-240 dead end)", () => {
    expect(routeForPushData({ classInstanceId: "5" })).toBeNull();
    expect(routeForPushData({ type: "message", classInstanceId: "5" })).toBeNull();
  });

  it("ignores junk payloads", () => {
    expect(routeForPushData(undefined)).toBeNull();
    expect(routeForPushData("nope")).toBeNull();
    expect(routeForPushData({ type: "other", conversationId: "1" })).toBeNull();
  });
});
