import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** calendar.event-detail rule 5 (PO M-7512), the phone's half: a student's class screen counts from the
 * payload's `participantCount`, not from the one row it has; the coach's count (the B-240 draft, the PAD-771
 * header) stays local. Source-reading, like class-type-chip-render: app/class/[id].tsx mounts react-query hooks. */
const SCREEN = readFileSync(resolve(__dirname, "../../../app/class/[id].tsx"), "utf8");

describe("the class screen's count", () => {
  it("[CALENDAR-EVENT-DETAIL-42] takes a student's count from the payload through the shared helper", () => {
    expect(SCREEN).toMatch(/viewFilledSpots\(\s*instance\?\.participantCount,\s*isCoach,/);
  });
});
