import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customPresencePeriod, presencePeriod } from "@levelup/config";

import { DEFAULT_SORT } from "./report-state";
import {
  echoedPeriodLabel,
  effectiveChoice,
  formatPeriodDay,
  isDefaultChoice,
  periodBounds,
  shortcutChoice,
  tabOpenState,
} from "./presences-period";

/**
 * PAD-837c on iOS: the period control's state (attendance.validation rules 17f, 17g; criteria
 * 67, 70, 72). The screen and the control are Maestro's; what a choice means, what the label
 * shows and what an open starts from are here.
 */
describe("the Presences period on iOS (PAD-837c)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A Sunday, mid-month: "this week" and "this month" start on different days.
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("[ATTENDANCE-VALIDATION-70] a shortcut's bounds are the shared function's, so both shells send the same days", () => {
    for (const shortcut of ["thisWeek", "thisMonth", "lastMonth"] as const) {
      expect(periodBounds(shortcutChoice(shortcut))).toEqual(presencePeriod(shortcut));
    }
    expect(periodBounds(shortcutChoice("thisMonth"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodBounds(shortcutChoice("lastMonth"))).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("[ATTENDANCE-VALIDATION-70] a custom range goes through the shared check", () => {
    expect(periodBounds({ kind: "custom", from: "2026-09-01", to: "2026-10-01" })).toEqual(
      customPresencePeriod("2026-09-01", "2026-10-01")
    );
    expect(periodBounds({ kind: "custom", from: "2026-10-01", to: "2026-09-01" })).toBeNull();
  });

  it("[ATTENDANCE-VALIDATION-67] the label is the payload's echoed bounds, day first, never the request", () => {
    // "Este mês" asked for the 30th; the server read up to today (rule 17h) and says so.
    expect(echoedPeriodLabel({ from: "2026-11-01T00:00:00", to: "2026-11-15T23:59:59" })).toBe(
      "01/11/2026 – 15/11/2026"
    );
    expect(echoedPeriodLabel(undefined)).toBeNull();
    expect(formatPeriodDay("2026-09-01")).toBe("01/09/2026");
  });

  it("[ATTENDANCE-VALIDATION-72] opens on the coach's default period and the default sort", () => {
    const open = tabOpenState();
    expect(open.choice).toBeNull();
    expect(open.sort).toEqual(DEFAULT_SORT);
    // No choice reads as the default, whatever the default is (Q5: per coach, "thisMonth" unset).
    expect(effectiveChoice(open.choice, "thisMonth")).toEqual(shortcutChoice("thisMonth"));
    expect(effectiveChoice(open.choice, "lastMonth")).toEqual(shortcutChoice("lastMonth"));
    // A choice stands over the default until the next open.
    expect(effectiveChoice(shortcutChoice("thisWeek"), "lastMonth")).toEqual(shortcutChoice("thisWeek"));
  });

  it("[ATTENDANCE-VALIDATION-72] knows which choice is the default; a custom range never is", () => {
    expect(isDefaultChoice(shortcutChoice("lastMonth"), "lastMonth")).toBe(true);
    expect(isDefaultChoice(shortcutChoice("thisWeek"), "lastMonth")).toBe(false);
    expect(isDefaultChoice({ kind: "custom", from: "2026-10-01", to: "2026-10-31" }, "lastMonth")).toBe(false);
  });
});
