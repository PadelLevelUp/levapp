/**
 * PAD-818 (B-723, client.pull-to-refresh rule 5a): on Android a drag in the validation sheet puts
 * the keyboard away even when the list does not scroll; iOS keeps `keyboardDismissMode="on-drag"`
 * and gets no extra handlers. The device proof is Maestro flows 312 and 313 on the Android lane.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Keyboard: { dismiss: () => undefined }, Platform: { OS: "ios" } }));

import { DRAG_SLOP, dragDismissHandlers, movedPastSlop } from "./drag-dismiss";

const at = (pageY: number) => ({ nativeEvent: { pageY } });

describe("movedPastSlop", () => {
  it("is a drag only past the slop, either way", () => {
    expect(movedPastSlop(100, 100 + DRAG_SLOP)).toBe(false);
    expect(movedPastSlop(100, 100 + DRAG_SLOP + 1)).toBe(true);
    expect(movedPastSlop(100, 100 - DRAG_SLOP - 1)).toBe(true);
  });

  it("is never a drag without a touch start", () => {
    expect(movedPastSlop(null, 500)).toBe(false);
  });
});

describe("dragDismissHandlers (rule 5a)", () => {
  it("adds nothing on iOS, which keeps on-drag", () => {
    expect(dragDismissHandlers("ios", () => undefined)).toEqual({});
  });

  it("on Android, dismisses once a touch moves past the slop, and once per touch", () => {
    const dismiss = vi.fn();
    const h = dragDismissHandlers("android", dismiss);
    h.onTouchStart!(at(300));
    h.onTouchMove!(at(305)); // a tap's jitter
    expect(dismiss).not.toHaveBeenCalled();
    h.onTouchMove!(at(340));
    h.onTouchMove!(at(380));
    expect(dismiss).toHaveBeenCalledTimes(1);
    h.onTouchStart!(at(200));
    h.onTouchMove!(at(150));
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it("is on both of the sheet's scroll areas, next to on-drag", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "ValidateClassesSheet.tsx"), "utf8");
    expect(src.match(/keyboardDismissMode="on-drag"/g)).toHaveLength(2);
    expect(src).toContain("{...listDragDismiss}");
    expect(src).toContain("{...detailDragDismiss}");
    expect(src.match(/useDragDismissKeyboard\(\)/g)).toHaveLength(2);
  });
});
