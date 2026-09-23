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

describe("PAD-327: the `path` shape", () => {
  it("routes a plain in-app path through the app's one web-path mapper", () => {
    expect(routeForPushData({ type: "path", path: "/settings?section=club" })).toEqual({
      pathname: "/settings",
      params: { section: "club" },
    });
    expect(routeForPushData({ type: "path", path: "/dashboard" })).toEqual({
      pathname: "/(tabs)/dashboard",
    });
    expect(routeForPushData({ type: "path", path: "/players" })).toEqual({
      pathname: "/(tabs)/players",
    });
  });

  it("goes nowhere, and does not throw, for a path it cannot map", () => {
    // Fail-safe, same rule as B-074's unknown branch: when you cannot tell,
    // do nothing rather than guess. A crash on a notification tap is the worst
    // possible reading of "unknown".
    expect(routeForPushData({ type: "path", path: "/something-new" })).toBeNull();
    expect(routeForPushData({ type: "path" })).toBeNull();
    expect(routeForPushData({ type: "path", path: "" })).toBeNull();
  });

  it("still ignores a payload with no type it knows", () => {
    expect(routeForPushData({ type: "request", kind: "club_join.received" })).toBeNull();
  });
});

describe("routeForPushData carries the tapped message (PAD-408, rule 12)", () => {
  it("targets the message when the push names one", () => {
    expect(
      routeForPushData({ type: "message", conversationId: 7, messageId: 42 })
    ).toBe("/conversation/7?message=42");
  });

  it("accepts the id as a string, as APNs delivers it", () => {
    expect(
      routeForPushData({ type: "message", conversationId: "7", messageId: "42" })
    ).toBe("/conversation/7?message=42");
  });

  it("keeps a push without messageId exactly as before", () => {
    expect(routeForPushData({ type: "message", conversationId: 7 })).toBe(
      "/conversation/7"
    );
  });

  it("ignores a messageId that is not an id", () => {
    expect(
      routeForPushData({ type: "message", conversationId: 7, messageId: "abc" })
    ).toBe("/conversation/7");
    expect(
      routeForPushData({ type: "message", conversationId: 7, messageId: null })
    ).toBe("/conversation/7");
  });
});
