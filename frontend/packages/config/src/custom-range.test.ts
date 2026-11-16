import { describe, expect, it } from "vitest";

import { isValidCustomRange } from "./custom-range";

describe("isValidCustomRange", () => {
  it("[ATTENDANCE-HISTORY-3] accepts an ordered pair", () => {
    expect(isValidCustomRange("2026-01-01", "2026-03-31")).toBe(true);
  });

  it("[ATTENDANCE-HISTORY-3] accepts a single-day period", () => {
    expect(isValidCustomRange("2026-01-01", "2026-01-01")).toBe(true);
  });

  it("[ATTENDANCE-HISTORY-3] rejects a reversed pair", () => {
    expect(isValidCustomRange("2026-03-31", "2026-01-01")).toBe(false);
  });

  it("[ATTENDANCE-HISTORY-3] rejects a half-filled pair", () => {
    expect(isValidCustomRange("", "2026-01-01")).toBe(false);
    expect(isValidCustomRange("2026-01-01", "")).toBe(false);
  });
});
