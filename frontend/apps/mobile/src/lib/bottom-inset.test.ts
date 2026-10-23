import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));

import { KEYBOARD_SCREENS, rootContentBottomPadding, screenBottomInset, tabBarBottom } from "./bottom-inset";

describe("PAD-730: content stays out from under the Android navigation bar", () => {
  it("the tab bar takes Android's 3-button bar (48 dp) under its labels", () => {
    expect(tabBarBottom("android", 48)).toEqual({ paddingBottom: 48, height: 108 });
  });

  it("with gestures (24 dp) or no inset the tab bar keeps a small margin", () => {
    expect(tabBarBottom("android", 24)).toEqual({ paddingBottom: 24, height: 84 });
    expect(tabBarBottom("android", 0)).toEqual({ paddingBottom: 8, height: 68 });
  });

  it("iOS keeps the 24/84 it was tuned for, whatever the inset", () => {
    expect(tabBarBottom("ios", 34)).toEqual({ paddingBottom: 24, height: 84 });
    expect(tabBarBottom("ios", 0)).toEqual({ paddingBottom: 24, height: 84 });
  });

  it("the root Stack pads by the inset on Android only", () => {
    expect(rootContentBottomPadding("android", 48)).toBe(48);
    expect(rootContentBottomPadding("ios", 34)).toBe(0);
  });

  it("a screen that adds the inset itself adds none on Android (no double padding)", () => {
    expect(screenBottomInset("android", 48)).toBe(0);
    expect(screenBottomInset("ios", 34)).toBe(34);
  });

  it("every root-Stack screen with a KeyboardAvoidingView is left out of the root padding", () => {
    const app = join(__dirname, "../../app");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith("(")) walk(path); // (tabs) sits under the tab bar, not the root padding
        } else if (/\.tsx$/.test(entry.name) && !entry.name.startsWith("_")) files.push(path);
      }
    };
    walk(app);
    const keyboardRoutes = files
      .filter((f) => readFileSync(f, "utf8").includes("<KeyboardAvoidingView"))
      .map((f) => relative(app, f).replace(/\.tsx$/, ""))
      .sort();
    expect(keyboardRoutes.length).toBeGreaterThan(0);
    expect(keyboardRoutes).toEqual([...KEYBOARD_SCREENS].sort());
  });
});
