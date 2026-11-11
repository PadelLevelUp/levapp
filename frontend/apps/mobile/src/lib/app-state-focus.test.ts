import { describe, expect, it } from "vitest";
import { isBackgrounded, isForegroundReturn, settleAppState } from "./app-state-focus";

describe("foreground return (PAD-592)", () => {
  it("[MOBILE-INTERACTION-PERFORMANCE-3] background → active is a return", () => {
    expect(isForegroundReturn("background", "active")).toBe(true);
  });
  it("[MOBILE-INTERACTION-PERFORMANCE-3] inactive → active (Control Centre, Face ID, the switcher) is not", () => {
    expect(isForegroundReturn("inactive", "active")).toBe(false);
  });
  it("the first active after launch counts", () => {
    expect(isForegroundReturn(null, "active")).toBe(true);
    expect(isForegroundReturn("unknown", "active")).toBe(true);
  });
  it("leaving is only background", () => {
    expect(isBackgrounded("background")).toBe(true);
    expect(isBackgrounded("inactive")).toBe(false);
    expect(isForegroundReturn("active", "inactive")).toBe(false);
  });
});

describe("settled state (PAD-592)", () => {
  it("inactive is transient: the remembered state stays what it was", () => {
    expect(settleAppState("background", "inactive")).toBe("background");
    expect(settleAppState("active", "inactive")).toBe("active");
    expect(settleAppState("active", "background")).toBe("background");
    expect(settleAppState(null, "active")).toBe("active");
  });
});
