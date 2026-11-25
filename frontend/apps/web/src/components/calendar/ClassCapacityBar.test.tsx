/**
 * calendar.event-detail rule 27 (UI idea 3): the coach's capacity box shows the calendar card's own
 * fill bar, fed by the box's own numbers. The component is rendered here; the sheet's mount is
 * pinned by reading its source (the sheet mounts too much for a render test, see
 * ClassDetailSheet.count.test.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClassCapacityBar } from "./ClassCapacityBar";

// 8 seats, 5 listed students: 3 coming, 2 not answered yet.
const participants = [1, 2, 3, 4, 5].map((id) => ({ id: String(id) }));
const presences = [
  { playerId: "1", status: "present" },
  { playerId: "2", status: "present" },
  { playerId: "3", status: "present" },
];
const base = {
  participants,
  presences,
  capacity: 8,
  filled: 5,
  status: "scheduled",
  ended: false,
  canManage: true,
  editing: false,
};

describe("ClassCapacityBar", () => {
  it("[CALENDAR-EVENT-DETAIL-41] the bar follows the capacity box's own numbers", () => {
    const { rerender } = render(<ClassCapacityBar {...base} />);
    const bar = screen.getByTestId("class-fill-bar");
    expect(bar.getAttribute("data-confirmed")).toBe("3");
    expect(bar.getAttribute("data-filled")).toBe("5");
    expect(bar.getAttribute("data-capacity")).toBe("8");
    expect(bar.getAttribute("data-fill-tone")).toBe("warning");

    // full, ended, or completed before its end: the box's own colour
    rerender(<ClassCapacityBar {...base} filled={8} />);
    expect(screen.getByTestId("class-fill-bar").getAttribute("data-fill-tone")).toBe("current");
    rerender(<ClassCapacityBar {...base} ended />);
    expect(screen.getByTestId("class-fill-bar").getAttribute("data-fill-tone")).toBe("current");
    rerender(<ClassCapacityBar {...base} status="completed" />);
    expect(screen.getByTestId("class-fill-bar").getAttribute("data-fill-tone")).toBe("current");
  });

  it("[CALENDAR-EVENT-DETAIL-41] draws no bar while editing, canceled, with no capacity, or for a student", () => {
    for (const off of [{ editing: true }, { status: "canceled" }, { capacity: 0 }, { canManage: false }]) {
      const { container, unmount } = render(<ClassCapacityBar {...base} {...off} />);
      expect(container.querySelector('[data-testid="class-fill-bar"]')).toBeNull();
      unmount();
    }
  });

  it("[CALENDAR-EVENT-DETAIL-41] the sheet mounts it inside its capacity box with the box's own filled count", () => {
    const src = readFileSync(join(__dirname, "ClassDetailSheet.tsx"), "utf8");
    const box = src.slice(src.indexOf('data-testid="class-detail-capacity"'), src.indexOf("{/* Level */}"));
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?filled=\{effectiveFilled\}/);
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?participants=\{active\.participants\}/);
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?editing=\{isEditing\}/);
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?canManage=\{canManage\}/);
  });
});
