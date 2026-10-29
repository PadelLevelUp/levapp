/**
 * PAD-790 (B-710) — calendar.mobile-views rule 13, iOS: the day sheet floats over the week grid, so
 * the grid's scroll content ends with padding as tall as the part the sheet covers, never shorter
 * than the floating buttons' clearance, following the sheet's committed position. Criterion "The
 * last hour clears the sheet". The padding reaches the grid as a shared value, so a committed drag
 * still does not re-render the memoised grid (PAD-592, GridWithSheet.memo.test.tsx).
 */
import { GRID_ROW_HEIGHT, SHEET_COLLAPSED_HEIGHT } from "@levelup/config";
import * as React from "react";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { GridWithSheet } from "./GridWithSheet";
import { FAB_CLEARANCE } from "./layout";

let latestSheet: { top: number; onTopChange: (top: number) => void } | null = null;
vi.mock("./DaySheet", () => ({
  DaySheet: (p: { top: number; onTopChange: (top: number) => void }) => {
    latestSheet = p;
    return null;
  },
}));
vi.mock("@/lib/android-back", () => ({ useAndroidBack: () => undefined }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));

const day = new Date(2026, 9, 29);
const props = {
  days: [day],
  selectedDay: day,
  onSelectDay: vi.fn(),
  eventsByDay: {},
  rangeEvents: [],
  levelCodeById: new Map<string, string>(),
};

async function mount() {
  const n = await renderNative(<GridWithSheet {...props} />);
  const inset = () => {
    const grid = n.root.root.findAll((i) => typeof i.type !== "string" && i.props.bottomInset !== undefined)[0];
    if (!grid) throw new Error("the time grid has no bottomInset");
    return (grid.props.bottomInset as { value: number }).value;
  };
  // Layout does not run under react-test-renderer: give the container a height so the sheet mounts.
  const container = n.root.root.findAll((i) => typeof i.props.onLayout === "function")[0]!;
  await act(async () => {
    container.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
  });
  return { n, inset };
}

describe("GridWithSheet bottom inset, iOS (PAD-790)", () => {
  it("ends the grid with a spacer that starts at the floating buttons' clearance", async () => {
    const n = await renderNative(<GridWithSheet {...props} />);
    const spacer = n.byTestId("calendar-grid-end-space");
    const style = [spacer.props.style].flat().reduce((a: object, s: object) => ({ ...a, ...s }), {});
    expect(style).toMatchObject({ height: FAB_CLEARANCE });
  });

  it("is the part of the grid the sheet covers at rest", async () => {
    const { inset } = await mount();
    expect(latestSheet!.top).toBe(480); // 60% of 800
    expect(inset()).toBe(800 - 480);
  });

  it("follows the sheet when it is raised and lowered", async () => {
    const { inset } = await mount();
    await act(async () => latestSheet!.onTopChange(GRID_ROW_HEIGHT));
    expect(inset()).toBe(800 - GRID_ROW_HEIGHT);
    await act(async () => latestSheet!.onTopChange(800 - SHEET_COLLAPSED_HEIGHT));
    expect(inset()).toBe(FAB_CLEARANCE);
  });
});
