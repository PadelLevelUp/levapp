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

  it("ignores the retired `class` type (PAD-326)", () => {
    // This asserted `/class/5` until PAD-326. The type had no producer left
    // once the join-request push took the message shape, and a type nobody
    // sends must not be routable — reviving it needs
    // `messaging.push-notifications` rule 7 changed first. The screen it used
    // to target can now resolve an id (`calendar.event-detail` rule 15), so
    // this is not "the destination is broken" any more; it is "nothing emits
    // this and we do not keep branches alive for cases we cannot honour".
    expect(routeForPushData({ type: "class", classInstanceId: "5" })).toBeNull();
    expect(routeForPushData({ type: "class", classInstanceId: 5 })).toBeNull();
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
