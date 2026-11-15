import { describe, expect, it } from "vitest";

import { presencesCsvFileName } from "./presences-csv";

describe("presencesCsvFileName", () => {
  it("[ATTENDANCE-VALIDATION-18] 23:30 UTC on a summer evening is the next day at the club", () => {
    expect(presencesCsvFileName(new Date("2026-07-14T23:30:00Z"))).toBe("presences-2026-07-15.csv");
  });

  it("[ATTENDANCE-VALIDATION-18] in winter the club's day is the UTC day", () => {
    expect(presencesCsvFileName(new Date("2026-12-14T23:30:00Z"))).toBe("presences-2026-12-14.csv");
  });
});
