/**
 * PAD-592 — mobile.performance: a sheet position committed into GridWithSheet's state re-renders
 * the container, but the time grid under it is memoised and skips (its props are unchanged). The
 * per-frame drag is on a Reanimated shared value inside DaySheet (no React state at all); this pins
 * the commit on release, which is the one React render the drag still causes. Render count is read
 * from the dev-only `[render] timegrid` line the simulator measurement reads too.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { GridWithSheet } from "./GridWithSheet";

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

describe("GridWithSheet drag commit (PAD-592)", () => {
  const g = globalThis as { __DEV__?: boolean };
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    g.__DEV__ = true;
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => {
    log.mockRestore();
    delete g.__DEV__;
    latestSheet = null;
  });
  const gridRenders = () => log.mock.calls.filter((c) => c[0] === "[render] timegrid").length;

  it("a committed sheet position re-renders the container but not the time grid", async () => {
    const n = await renderNative(<GridWithSheet {...props} />);
    // Layout does not run under react-test-renderer: give the container a height so the sheet mounts.
    const container = n.root.root.findAll((i) => typeof i.props.onLayout === "function")[0]!;
    await act(async () => {
      container.props.onLayout({ nativeEvent: { layout: { height: 800 } } });
    });
    expect(latestSheet).not.toBeNull();
    const before = gridRenders();
    expect(before).toBeGreaterThan(0);
    const top = latestSheet!.top;

    await act(async () => {
      latestSheet!.onTopChange(top - 120);
    });

    expect(latestSheet!.top).toBe(top - 120); // the container did re-render with the new position
    expect(gridRenders()).toBe(before); // ...and the grid under it did not
  });
});
