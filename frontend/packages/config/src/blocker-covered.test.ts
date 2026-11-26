/**
 * calendar.student-blockers rule 21 (PAD-772): what the dialog does with a block save's answer is one
 * decision both shells read — no key or an empty list asks nothing, a list asks once and in order, yes sends
 * exactly the listed occurrences, keep sends nothing, and a failed mark never says the block was not saved.
 */
import { describe, expect, it, vi } from "vitest";
import { coveredClassesOf, coveredClassParts, decideCoveredFollowUp, declineCoveredBody, type CoveredClass } from "./blocker-covered";

const wed: CoveredClass = { model: "Lesson", originalId: 7, date: "2026-12-02", title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const tue: CoveredClass = { model: "LessonInstance", originalId: 9, date: "2026-12-08", title: "Terça", start: "2026-12-08T18:00:00", end: "2026-12-08T19:00:00" };

describe("blocker covered classes (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-23] asks only when the save answers covered classes, and yes sends exactly those", async () => {
    // An old server (no key), an empty list and a malformed key ask nothing.
    for (const answer of [undefined, null, {}, { coveredClasses: [] }, { coveredClasses: "x" }]) {
      expect(coveredClassesOf(answer as never)).toEqual([]);
      const ask = vi.fn();
      const mark = vi.fn();
      expect(await decideCoveredFollowUp(answer as never, ask, mark)).toEqual({ asked: false, answered: null, marked: 0, failed: false });
      expect(ask).not.toHaveBeenCalled();
      expect(mark).not.toHaveBeenCalled();
    }

    // Two classes: one question listing both in order; keep sends nothing.
    const ask = vi.fn(async () => "keep" as const);
    const mark = vi.fn(async () => ({ declined: [], skipped: [] }));
    expect(await decideCoveredFollowUp({ coveredClasses: [wed, tue] }, ask, mark)).toEqual({ asked: true, answered: "keep", marked: 0, failed: false });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith([wed, tue]);
    expect(mark).not.toHaveBeenCalled();

    // Yes sends exactly the listed (model, originalId, date), no more fields, and counts what was declined.
    const yes = vi.fn(async () => "yes" as const);
    const marked = vi.fn(async () => ({
      declined: [{ model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 1 }],
      skipped: [{ model: "LessonInstance", originalId: 9, date: "2026-12-08", reason: "already_answered" }],
    }));
    expect(await decideCoveredFollowUp({ coveredClasses: [wed, tue] }, yes, marked)).toEqual({ asked: true, answered: "yes", marked: 1, failed: false });
    expect(marked).toHaveBeenCalledWith({
      occurrences: [
        { model: "Lesson", originalId: 7, date: "2026-12-02" },
        { model: "LessonInstance", originalId: 9, date: "2026-12-08" },
      ],
    });
    // A dialog line: title, weekday, the language's short date, the time.
    expect(coveredClassParts(wed, "pt")).toMatchObject({ title: "Quarta", date: "02/12/2026", time: "19:00–20:00" });
    expect(declineCoveredBody([tue])).toEqual({ occurrences: [{ model: "LessonInstance", originalId: 9, date: "2026-12-08" }] });

    // A failed mark reports the error and never throws, so the shell cannot call the block unsaved.
    const broken = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await decideCoveredFollowUp({ coveredClasses: [wed] }, yes, broken)).toEqual({ asked: true, answered: "yes", marked: 0, failed: true });
  });
});
