import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DaySheet, SHEET_COLLAPSED_HEIGHT, SHEET_HANDLE_HEIGHT } from "./DaySheet";

/**
 * PAD-286 — calendar.mobile-views rule 3, criterion "The grab handle is obvious
 * and easy to catch": a 40×5 `primary` pill on a 28px row, and the day header
 * is part of the drag surface.
 */
const bounds = { min: 44, max: 400, initial: 200 };

// jsdom has no PointerEvent, and testing-library's fallback Event drops clientX/Y
// (same shim as TacticalBoard.test.tsx).
class JsdomPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
    this.isPrimary = init.isPrimary ?? true;
  }
}

beforeEach(() => {
  if (typeof window.PointerEvent === "undefined") {
    (window as unknown as { PointerEvent: typeof JsdomPointerEvent }).PointerEvent = JsdomPointerEvent;
  }
});

function renderSheet(onTopChange = vi.fn()) {
  render(
    <DaySheet
      top={200}
      bounds={bounds}
      onTopChange={onTopChange}
      day={new Date(2026, 8, 7)}
      events={[]}
      levelCodeById={new Map()}
    />
  );
  return onTopChange;
}

describe("DaySheet grab handle (PAD-286)", () => {
  it("is a 28px row with a primary 40×5 pill, and the collapsed height follows it", () => {
    renderSheet();
    const handle = screen.getByTestId("calendar-sheet-handle");
    expect(SHEET_HANDLE_HEIGHT).toBeGreaterThanOrEqual(28);
    expect(handle.style.height).toBe(`${SHEET_HANDLE_HEIGHT}px`);
    const pill = handle.firstElementChild as HTMLElement;
    expect(pill.className).toContain("bg-primary");
    expect(pill.className).toContain("w-10");
    expect(pill.className).toContain("h-[5px]");
    expect(SHEET_COLLAPSED_HEIGHT).toBe(SHEET_HANDLE_HEIGHT + 76);
  });

  it("moves the sheet when the drag starts on the day header, exactly as on the pill", () => {
    const onTopChange = renderSheet();
    const heading = screen.getByRole("heading", { level: 3 });
    fireEvent.pointerDown(heading, { clientY: 300, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(heading, { clientY: 250, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerUp(heading, { clientY: 250, pointerId: 1, button: 0, isPrimary: true });
    expect(onTopChange).toHaveBeenLastCalledWith(150);

    onTopChange.mockClear();
    const handle = screen.getByTestId("calendar-sheet-handle");
    fireEvent.pointerDown(handle, { clientY: 300, pointerId: 2, button: 0, isPrimary: true });
    fireEvent.pointerMove(handle, { clientY: 250, pointerId: 2, button: 0, isPrimary: true });
    fireEvent.pointerUp(handle, { clientY: 250, pointerId: 2, button: 0, isPrimary: true });
    expect(onTopChange).toHaveBeenLastCalledWith(150);
  });

  it("clamps a header drag to the bounds", () => {
    const onTopChange = renderSheet();
    const heading = screen.getByRole("heading", { level: 3 });
    fireEvent.pointerDown(heading, { clientY: 300, pointerId: 3, button: 0, isPrimary: true });
    fireEvent.pointerMove(heading, { clientY: -500, pointerId: 3, button: 0, isPrimary: true });
    expect(onTopChange).toHaveBeenLastCalledWith(44);
  });
});
