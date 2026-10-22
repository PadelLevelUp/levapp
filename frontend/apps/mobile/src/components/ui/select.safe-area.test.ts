/**
 * PAD-727 (B-605, mobile.android-runtime rule 9b): on Android a select's list stays between
 * the system bars. The app draws edge to edge there, and the popper measured against the whole
 * window, so the last options of a long list near the bottom of a form sat under the navigation
 * bar (Maestro flow 280 on the Android lane). The device proof is flow 280; this pins the rule
 * in the shared component every select goes through, and that iOS keeps its values.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-reanimated", () => ({ default: { View: () => null } }));
vi.mock("@rn-primitives/select", () => ({ Root: () => null, Group: () => null }));
vi.mock("@/lib/font-class", () => ({ resolveFontClass: (c: string) => c }));
vi.mock("@/lib/android-back", () => ({ useAndroidBack: () => undefined }));
vi.mock("@/lib/dialog-motion", () => ({ dialogEntering: () => undefined, dialogExiting: () => undefined }));

import { selectListLayout } from "./select";

const PIXEL_6 = { top: 24, bottom: 48, left: 0, right: 0 }; // status bar, 3-button navigation
const LIST_CAP = 384 - 8 - 2; // max-h-96 less the viewport's padding and border (rule 9b)

describe("selectListLayout (rule 9b, PAD-727)", () => {
  it("leaves iOS as it was: no insets for the popper, the fixed cap", () => {
    expect(selectListLayout("ios", { top: 59, bottom: 34, left: 0, right: 0 }, 852)).toEqual({ maxHeight: LIST_CAP });
  });

  it("on Android, hands the popper the bars plus a gap, so it keeps the list above the navigation bar", () => {
    const { insets } = selectListLayout("android", PIXEL_6, 915);
    expect(insets).toEqual({ top: 32, bottom: 56, left: 0, right: 0 });
  });

  it("keeps the cap on a phone with room for it", () => {
    expect(selectListLayout("android", PIXEL_6, 915).maxHeight).toBe(LIST_CAP);
  });

  it("caps the list to the room between the bars on a short screen", () => {
    // 400 - (24 + 8) - (48 + 8) - 10 = 302
    expect(selectListLayout("android", PIXEL_6, 400).maxHeight).toBe(302);
  });

  it("never asks for a negative height", () => {
    expect(selectListLayout("android", PIXEL_6, 50).maxHeight).toBe(0);
  });

  it("is what SelectContent uses, for the popper and for the scrolling list", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "select.tsx"), "utf8");
    const content = src.slice(src.indexOf("function SelectContent"), src.indexOf("function SelectLabel"));
    expect(content).toContain("selectListLayout(Platform.OS, safeArea, windowHeight)");
    expect(content).toContain("insets={layout.insets}");
    expect(content).toContain("maxHeight: layout.maxHeight");
  });
});
