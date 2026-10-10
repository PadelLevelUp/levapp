import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * B-422 (PAD-560 follow-up; calendar.event-detail rules 15 and 20): the class screen must know a
 * class recurs even when opened by deep link, where no calendar event is in hand — from the
 * payload's `isRecurring`, or its `recurrenceEnd`. A source-grep test, as the sibling wiring tests
 * (the screen mounts react-query hooks the unit harness cannot). Flow 219 proves it on the simulator.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREEN = fs.readFileSync(path.join(HERE, "..", "..", "..", "app", "class", "[id].tsx"), "utf8");

describe("the class screen knows a deep-linked class recurs (B-422)", () => {
  it("reads the payload's isRecurring and falls back to its recurrenceEnd", () => {
    expect(SCREEN).toMatch(
      /const isRecurring = event\.isRecurring \|\| instance\?\.isRecurring === true \|\| instance\?\.recurrenceEnd != null;/,
    );
  });

  it("hands that flag, and the series end, to the waiting-list section", () => {
    expect(SCREEN).toMatch(/<ClassWaitingListSection[\s\S]{0,120}isRecurring=\{isRecurring\}[\s\S]{0,80}recurrenceEnd=\{instance\.recurrenceEnd \?\? null\}/);
  });
});
