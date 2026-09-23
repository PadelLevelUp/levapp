/**
 * PAD-409 / B-166 — messaging.push-notifications rule 13.
 *
 * A tap that launches the app arrives before the root navigator exists; a
 * navigation then loops the root layout and is lost (measured 3/3 on the
 * simulator). The tap's target is held until the navigator is mounted and auth
 * has settled, then released exactly once — and "once" must survive a re-mount
 * of whatever component drives it, so the dedup is module state, not a ref.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  offerPushTap,
  resetPushTapsForTest,
  takeReadyPushTap,
} from "./push-tap-queue";

const READY = { navigatorReady: true, authLoading: false, signedIn: true };

describe("push tap queue", () => {
  beforeEach(() => resetPushTapsForTest());

  it("holds a tap until the navigator is mounted", () => {
    offerPushTap("n1", "/conversation/1");
    expect(takeReadyPushTap({ ...READY, navigatorReady: false })).toBeNull();
    expect(takeReadyPushTap(READY)).toBe("/conversation/1");
  });

  it("holds a tap while auth is still loading", () => {
    offerPushTap("n1", "/conversation/1");
    expect(takeReadyPushTap({ ...READY, authLoading: true })).toBeNull();
    expect(takeReadyPushTap(READY)).toBe("/conversation/1");
  });

  it("releases a tap exactly once", () => {
    offerPushTap("n1", "/conversation/1");
    expect(takeReadyPushTap(READY)).toBe("/conversation/1");
    expect(takeReadyPushTap(READY)).toBeNull();
  });

  it("ignores the same notification offered again (cold-start path + live listener, or a re-mount)", () => {
    offerPushTap("n1", "/conversation/1");
    expect(takeReadyPushTap(READY)).toBe("/conversation/1");
    offerPushTap("n1", "/conversation/1");
    expect(takeReadyPushTap(READY)).toBeNull();
  });

  it("drops a tap that launched a signed-out app", () => {
    offerPushTap("n1", "/conversation/1");
    expect(takeReadyPushTap({ ...READY, signedIn: false })).toBeNull();
    expect(takeReadyPushTap(READY)).toBeNull();
  });

  it("keeps only the latest of two distinct taps", () => {
    offerPushTap("n1", "/conversation/1");
    offerPushTap("n2", "/conversation/2");
    expect(takeReadyPushTap(READY)).toBe("/conversation/2");
    expect(takeReadyPushTap(READY)).toBeNull();
  });
});
