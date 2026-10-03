import { describe, expect, it } from "vitest";
import {
  STANDING_PRESETS,
  isStandingEndAllowed,
  standingEndBounds,
  standingEndFor,
  standingEndLabel,
  standingPresetOf,
} from "./standing-end";

const today = new Date(2026, 9, 3); // 3 Oct 2026, local

describe("standing waiting-list end date (PAD-507)", () => {
  it("presets count from today", () => {
    expect(STANDING_PRESETS.map((p) => standingEndFor(p.key, today))).toEqual([
      "2026-10-10",
      "2026-10-17",
      "2026-11-03",
      "2026-12-03",
      "2027-04-03",
      "2027-10-03",
    ]);
  });

  it("an end may be today through twelve months ahead, and nothing else", () => {
    expect(standingEndBounds(today)).toEqual({ min: "2026-10-03", max: "2027-10-03" });
    expect(isStandingEndAllowed("2026-10-03", today)).toBe(true);
    expect(isStandingEndAllowed("2027-10-03", today)).toBe(true);
    expect(isStandingEndAllowed("2026-10-02", today)).toBe(false);
    expect(isStandingEndAllowed("2027-10-04", today)).toBe(false);
    expect(isStandingEndAllowed("", today)).toBe(false);
    expect(isStandingEndAllowed("2026-13-01", today)).toBe(false);
  });

  it("a date that is a preset shows that preset as chosen; any other date none", () => {
    expect(standingPresetOf("2026-11-03", today)).toBe("1m");
    expect(standingPresetOf("2026-11-04", today)).toBeNull();
  });
});

describe("standingEndLabel", () => {
  it("names the day with its year, in the app language", () => {
    expect(standingEndLabel("2027-10-03", "en")).toBe("Oct 3, 2027");
    expect(standingEndLabel("2027-10-03", "pt")).toBe("3 de out. de 2027");
  });
});
