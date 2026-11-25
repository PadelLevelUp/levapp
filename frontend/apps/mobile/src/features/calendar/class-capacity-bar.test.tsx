/**
 * calendar.event-detail rule 27 (UI idea 3), iOS: the coach's capacity box shows the calendar card's
 * fill bar, fed by the box's own numbers. The component is rendered here; the class screen's mount
 * is pinned by reading its source (the screen is too large to render in a unit test).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderNative } from "@/test/render-native";
import { ClassCapacityBar } from "./ClassCapacityBar";

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

const widths = (n: Awaited<ReturnType<typeof renderNative>>, id: string) =>
  n
    .byTestId(id)
    .children.map((c) => (typeof c === "string" ? c : (c.props.style as { width: string }).width));

describe("ClassCapacityBar (iOS)", () => {
  it("[CALENDAR-EVENT-DETAIL-42] the bar follows the capacity box's own numbers", async () => {
    const n = await renderNative(<ClassCapacityBar {...base} />);
    const bar = n.byTestId("class-fill-bar-warning");
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 8, now: 3 });
    // confirmed 3 of 8, then awaiting 2 of 8: the filled part is 5 of 8
    expect(widths(n, "class-fill-bar-warning")).toEqual(["37.5%", "25%"]);

    // full, ended, or completed before its end: the box's own colour, the plain test id
    for (const off of [{ filled: 8 }, { ended: true }, { status: "completed" }]) {
      await n.rerender(<ClassCapacityBar {...base} {...off} />);
      expect(n.queryByTestId("class-fill-bar")).not.toBeNull();
      expect(n.queryByTestId("class-fill-bar-warning")).toBeNull();
    }
  });

  it("[CALENDAR-EVENT-DETAIL-42] draws no bar while editing, canceled, with no capacity, or for a student", async () => {
    for (const off of [{ editing: true }, { status: "canceled" }, { capacity: 0 }, { canManage: false }]) {
      const n = await renderNative(<ClassCapacityBar {...base} {...off} />);
      expect(n.queryByTestId("class-fill-bar")).toBeNull();
      expect(n.queryByTestId("class-fill-bar-warning")).toBeNull();
    }
  });

  it("[CALENDAR-EVENT-DETAIL-42] the class screen mounts it inside its capacity box with the box's own filled count", () => {
    const src = readFileSync(join(__dirname, "../../../app/class/[id].tsx"), "utf8");
    const box = src.slice(src.indexOf('t("calendar.detail.capacity")'), src.indexOf('t("calendar.detail.level")'));
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?filled=\{filled\}/);
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?participants=\{countedParticipants\}/);
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?editing=\{isEditing\}/);
    expect(box).toMatch(/<ClassCapacityBar[\s\S]*?canManage=\{isCoach\}/);
  });
});
