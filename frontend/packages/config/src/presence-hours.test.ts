import { describe, expect, it } from "vitest";

import { balanceSign, formatBalanceHours, formatMinutesAsHours } from "./presence-hours";

describe("presence hours (PAD-837, attendance.validation rule 17d)", () => {
  it("[ATTENDANCE-VALIDATION-63] formats minutes as hours", () => {
    const cases: [number, string][] = [
      [45, "45min"],
      [90, "1h30"],
      [60, "1h"],
      [120, "2h"],
      [75, "1h15"],
      [0, "0min"],
      [150, "2h30"],
      [5, "5min"],
      [59, "59min"],
      [65, "1h05"],
      [600, "10h"],
    ];
    for (const [minutes, text] of cases) expect(formatMinutesAsHours(minutes), `${minutes}`).toBe(text);
  });

  it("[ATTENDANCE-VALIDATION-62] writes the sign before the hours", () => {
    expect(formatBalanceHours(45)).toBe("+45min");
    expect(formatBalanceHours(-45)).toBe("−45min");
    expect(formatBalanceHours(90)).toBe("+1h30");
    expect(formatBalanceHours(-60)).toBe("−1h");
    expect(formatBalanceHours(0)).toBe("0min");
    expect(formatBalanceHours(-45)).not.toContain("-"); // U+2212, not a hyphen
    expect([balanceSign(30), balanceSign(-30), balanceSign(0)]).toEqual(["positive", "negative", "zero"]);
  });
});
