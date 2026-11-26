/**
 * calendar.student-blockers rule 21 (PAD-772, owner correction 26 Nov 2026): what a block save's answer shows is
 * one decision both shells read — the classes the server marked give one count line and a re-read of the
 * calendar and dashboard, no key or an empty list give nothing, and there is never a question to ask.
 */
import { describe, expect, it } from "vitest";
import { followUpOfSave, markedClassesOf, type MarkedClass } from "./blocker-covered";

const wed: MarkedClass = { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 11, title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const tue: MarkedClass = { model: "LessonInstance", originalId: 9, date: "2026-12-08", lessonInstanceId: 9, title: "Terça", start: "2026-12-08T18:00:00", end: "2026-12-08T19:00:00" };

describe("what follows a block save (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-23] a save answer gives a count line or nothing, never a question", () => {
    // An old server (no key), an empty list, a malformed key and no answer at all show nothing beyond the save.
    for (const answer of [undefined, null, {}, { markedClasses: [] }, { markedClasses: "x" }]) {
      expect(markedClassesOf(answer as never)).toEqual([]);
      expect(followUpOfSave(answer as never)).toEqual({ marked: 0, refresh: false });
    }

    // One and two marked classes: the count the toast shows, and the calendar and dashboard are read again.
    expect(followUpOfSave({ markedClasses: [wed] })).toEqual({ marked: 1, refresh: true });
    expect(followUpOfSave({ markedClasses: [wed, tue] })).toEqual({ marked: 2, refresh: true });

    // The decision has no question, confirm or decline outcome to give, whatever the answer holds: a build's
    // non-empty `coveredClasses` (an old server's) changes nothing.
    const outcome = followUpOfSave({ markedClasses: [wed, tue], coveredClasses: [wed] } as never);
    expect(Object.keys(outcome).sort()).toEqual(["marked", "refresh"]);
    expect(followUpOfSave({ coveredClasses: [wed] } as never)).toEqual({ marked: 0, refresh: false });
  });
});
