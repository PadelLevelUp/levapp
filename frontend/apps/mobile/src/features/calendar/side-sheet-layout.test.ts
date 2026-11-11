/**
 * PAD-817 (B-722, mobile.android-runtime rule 9c): on Android the class side sheet's Cancel / Send
 * row stays above the navigation bar. The app draws edge to edge there, and the sheet's 20 pt
 * padding left the row behind the 3-button bar (Maestro flows 65 and 66 on the Android lane could
 * not tap `class-side-send`). The device proof is those flows; this pins the padding and that iOS
 * keeps its value.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SIDE_SHEET_PADDING, sideSheetPaddingBottom } from "./side-sheet-layout";

const PIXEL_6 = { bottom: 48 }; // 3-button navigation

describe("sideSheetPaddingBottom (rule 9c, PAD-817)", () => {
  it("[MOBILE-ANDROID-RUNTIME-9] leaves iOS as it was", () => {
    expect(sideSheetPaddingBottom("ios", { bottom: 34 })).toBe(SIDE_SHEET_PADDING);
  });

  it("[MOBILE-ANDROID-RUNTIME-9] on Android, adds the navigation bar to the padding", () => {
    expect(sideSheetPaddingBottom("android", PIXEL_6)).toBe(SIDE_SHEET_PADDING + 48);
  });

  it("[MOBILE-ANDROID-RUNTIME-9] on Android with no inset, is the plain padding", () => {
    expect(sideSheetPaddingBottom("android", { bottom: 0 })).toBe(SIDE_SHEET_PADDING);
  });

  it("is what the sheet uses", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "ClassSideSheet.tsx"), "utf8");
    expect(src).toContain("useSafeAreaInsets()");
    expect(src).toContain("paddingBottom: sideSheetPaddingBottom(Platform.OS, insets)");
  });
});
