/**
 * PAD-769 (messaging.conversation-detail rule 19): the reply haptic, and the over-the-air guard
 * that keeps it a no-op on a 1.1.2 binary built without the native module.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.fn();
vi.mock("expo-modules-core", () => ({ requireOptionalNativeModule: (name: string) => lookup(name) }));

import { lightImpact, resetHapticsForTest } from "./haptics";

beforeEach(() => {
  lookup.mockReset();
  resetHapticsForTest();
});

describe("lightImpact", () => {
  it("is a silent no-op on a binary without the native module", () => {
    lookup.mockReturnValue(null);
    expect(() => lightImpact()).not.toThrow();
    expect(lookup).toHaveBeenCalledWith("ExpoHaptics");
  });

  it("plays one light impact when the module is there", () => {
    const impactAsync = vi.fn(() => Promise.resolve());
    lookup.mockReturnValue({ impactAsync });
    lightImpact();
    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith("light");
  });

  it("swallows a failing impact (never an unhandled rejection)", async () => {
    lookup.mockReturnValue({ impactAsync: () => Promise.reject(new Error("no engine")) });
    expect(() => lightImpact()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

const root = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("wiring", () => {
  it("nothing imports expo-haptics itself (the OTA guard is the only way in)", () => {
    const files = [...sources(join(root, "app")), ...sources(join(root, "src"))];
    expect(files.length).toBeGreaterThan(100); // R-032: the scan finds its subject
    const importers = files.filter((f) => /from ["']expo-haptics["']|require\(["']expo-haptics["']\)/.test(readFileSync(f, "utf8")));
    expect(importers).toEqual([]);
  });

  it("the swipe plays it once, when it crosses the reply threshold, and re-arms at the gesture's end", () => {
    const bubble = readFileSync(join(root, "src", "features", "messages", "components", "message-bubble.tsx"), "utf8");
    const pan = bubble.slice(bubble.indexOf("const panGesture = Gesture.Pan()"), bubble.indexOf("const longPressGesture"));
    expect(pan.length).toBeGreaterThan(0);
    const update = pan.slice(pan.indexOf(".onUpdate("), pan.indexOf(".onEnd("));
    expect(update).toMatch(/e\.translationX > REPLY_TRIGGER_DISTANCE && !replyHapticPlayed\.value/);
    expect(update).toMatch(/replyHapticPlayed\.value = true;\s*runOnJS\(lightImpact\)\(\)/);
    expect(pan.slice(pan.indexOf(".onFinalize("))).toMatch(/replyHapticPlayed\.value = false/);
  });
});
