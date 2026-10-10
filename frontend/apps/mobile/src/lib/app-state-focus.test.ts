import { describe, expect, it } from "vitest";
import { isBackgrounded, isForegroundReturn } from "./app-state-focus";

describe("foreground return (PAD-592)", () => {
  it("background → active is a return", () => {
    expect(isForegroundReturn("background", "active")).toBe(true);
  });
  it("inactive → active (Control Centre, Face ID, the switcher) is not", () => {
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
