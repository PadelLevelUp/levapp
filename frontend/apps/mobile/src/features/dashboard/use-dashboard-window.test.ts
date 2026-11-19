import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboardWindow } from "./use-dashboard-window";

/**
 * PAD-839 (dashboard.student-setup-guide rule 1, criterion 29): the dashboard screen, the guide's
 * card and the header ring read the dashboard payload through this hook, so they share one cache
 * entry only if the window is the same all day. It runs from the device's local midnight to 30 days
 * on. The clock is pinned with local-time constructors (July, so no DST change falls inside the
 * 30 days), which keeps the test right in any time zone.
 */

type Window = { from: string; to: string };

/** Renders the hook and keeps every value it returns; `rerender` renders it again on the same mount. */
function renderHook() {
  const values: Window[] = [];
  function Probe() {
    values.push(useDashboardWindow());
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    get current() {
      return values[values.length - 1];
    },
    rerender: () => act(() => renderer.update(createElement(Probe))),
    unmount: () => act(() => renderer.unmount()),
  };
}

const DAY_MS = 86400000;

function windowFrom(midnight: Date): Window {
  return { from: midnight.toISOString(), to: new Date(midnight.getTime() + 30 * DAY_MS).toISOString() };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useDashboardWindow", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-29] one window per local day, from midnight to 30 days on", () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(new Date(2026, 6, 14, 9, 0));
    const morning = renderHook();
    expect(morning.current).toEqual(windowFrom(new Date(2026, 6, 14)));

    // Later the same day: the same window, on a new mount and on a re-render of the old one.
    vi.setSystemTime(new Date(2026, 6, 14, 21, 30));
    const evening = renderHook();
    expect(evening.current).toEqual(morning.current);
    const first = morning.current;
    morning.rerender();
    expect(morning.current).toBe(first);

    // Ten past midnight the next day: the next day's window.
    vi.setSystemTime(new Date(2026, 6, 15, 0, 10));
    const nextDay = renderHook();
    expect(nextDay.current).toEqual(windowFrom(new Date(2026, 6, 15)));
    expect(nextDay.current.from).not.toBe(first.from);

    morning.unmount();
    evening.unmount();
    nextDay.unmount();
  });
});
