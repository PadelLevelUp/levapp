import { describe, expect, it } from "vitest";
import {
  CLASS_COLOR_SWATCHES,
  RETIRED_CLASS_COLOR_REMAP,
  remapClassColor,
} from "./class-colors";
import { prefersWhiteTextOn } from "./calendar-status";

/**
 * calendar.mobile-views rule 6: the eight coach-pickable colours live in exactly
 * one place and never read as a status — no amber, red or green among them.
 *
 * Criteria: "The picker offers only the shared swatches",
 *           "Retired colours are remapped once".
 */
describe("CLASS_COLOR_SWATCHES", () => {
  it("is the eight cool/neutral hues, in picker order", () => {
    expect([...CLASS_COLOR_SWATCHES]).toEqual([
      "#1355DC", // blue
      "#0EA5E9", // sky
      "#0891B2", // cyan
      "#0D9488", // teal
      "#6366F1", // indigo
      "#8B5CF6", // violet
      "#A21CAF", // plum
      "#475569", // slate
    ]);
  });

  it("offers none of the retired status-looking hues", () => {
    const lower = CLASS_COLOR_SWATCHES.map((c) => c.toLowerCase());
    for (const retired of ["#ef4444", "#f97316", "#eab308", "#22c55e"]) {
      expect(lower).not.toContain(retired);
    }
  });

  it("every swatch is a colour the contrast helper can classify", () => {
    for (const hex of CLASS_COLOR_SWATCHES) {
      expect(prefersWhiteTextOn(hex)).not.toBeNull();
    }
  });
});

describe("remapClassColor", () => {
  it("maps each retired swatch to its replacement", () => {
    expect(remapClassColor("#ef4444")).toBe("#A21CAF");
    expect(remapClassColor("#f97316")).toBe("#0891B2");
    expect(remapClassColor("#eab308")).toBe("#0D9488");
    expect(remapClassColor("#22c55e")).toBe("#0D9488");
  });

  it("is case-insensitive on the stored value", () => {
    expect(remapClassColor("#EF4444")).toBe("#A21CAF");
  });

  it("leaves kept swatches and legacy free-form values alone", () => {
    expect(remapClassColor("#0ea5e9")).toBe("#0ea5e9");
    expect(remapClassColor("#123456")).toBe("#123456");
  });

  it("passes null and undefined through", () => {
    expect(remapClassColor(undefined)).toBeUndefined();
    expect(remapClassColor(null)).toBeNull();
  });

  it("is idempotent — a remapped value is never remapped again", () => {
    for (const [, replacement] of Object.entries(RETIRED_CLASS_COLOR_REMAP)) {
      expect(remapClassColor(replacement)).toBe(replacement);
    }
  });
});
