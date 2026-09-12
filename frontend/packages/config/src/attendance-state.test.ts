import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_STATES,
  attendanceStateOf,
  attendanceStateLabelKey,
  attendanceStateTone,
  cancellationDetail,
  reminderHint,
} from "./attendance-state";

/**
 * PAD-313 — one attendance state, rendered once.
 *
 * The founder's report on TestFlight 20: after cancelling, the class detail
 * showed "presença confirmada" + "falta justificada" + "ausente" at once. Three
 * badges, three columns, and the first one false — `confirmed` means *answered*,
 * and the decline path sets it true. These tests pin the replacement: one state,
 * exactly one true at a time, and the provenance of a cancellation carried
 * separately instead of being baked into the state word.
 */

const SERVER = (attendanceState: string) => ({ attendanceState });

describe("attendanceStateOf — the server's field wins", () => {
  it("returns each of the five states the server serves", () => {
    for (const state of ATTENDANCE_STATES) {
      expect(attendanceStateOf(SERVER(state))).toBe(state);
    }
  });

  it("has exactly five states, so a sixth cannot be added without a spec change", () => {
    expect([...ATTENDANCE_STATES]).toEqual([
      "planned",
      "coming",
      "not_coming",
      "attended",
      "missed",
    ]);
  });

  it("prefers the server field over the raw columns even when they disagree", () => {
    // The exact shape of the bug: a cancelled student still carries confirmed.
    const cancelled = {
      attendanceState: "not_coming",
      confirmed: true,
      status: "absent",
      justification: "justified",
      validated: false,
    };
    expect(attendanceStateOf(cancelled)).toBe("not_coming");
  });

  it("ignores a value it does not know and derives instead", () => {
    expect(attendanceStateOf({ attendanceState: "confirmed", confirmed: true })).toBe("coming");
    expect(attendanceStateOf({ attendanceState: "", confirmed: true })).toBe("coming");
  });
});

describe("attendanceStateOf — fallback for payloads without the field", () => {
  it("reads a cancellation as not_coming, never as coming, even though confirmed is true", () => {
    // The defect this ticket exists for: `confirmed` is tested AFTER `status`.
    expect(
      attendanceStateOf({
        confirmed: true,
        status: "absent",
        justification: "justified",
        validated: false,
      })
    ).toBe("not_coming");
  });

  it("reads an answered yes as coming", () => {
    expect(attendanceStateOf({ confirmed: true, status: null, validated: false })).toBe("coming");
  });

  it("reads an unanswered row as planned", () => {
    expect(attendanceStateOf({ confirmed: false, status: null, validated: false })).toBe("planned");
    expect(attendanceStateOf({})).toBe("planned");
    expect(attendanceStateOf(null)).toBe("planned");
    expect(attendanceStateOf(undefined)).toBe("planned");
  });

  it("reports the coach's record once validated, and only then", () => {
    expect(attendanceStateOf({ status: "present", validated: true })).toBe("attended");
    expect(
      attendanceStateOf({ status: "absent", justification: "justified", validated: true })
    ).toBe("missed");
    // Unvalidated, the same columns are still the student's intent.
    expect(
      attendanceStateOf({ status: "absent", justification: "justified", validated: false })
    ).toBe("not_coming");
    expect(attendanceStateOf({ status: "present", validated: false })).toBe("coming");
  });

  it("calls an unjustified absence missed rather than labelling it justified", () => {
    // `not_coming` asserts the absence IS justified (coordinator, 2026-09-12),
    // so an unjustified one cannot borrow that word.
    expect(
      attendanceStateOf({ status: "absent", justification: "unjustified", validated: false })
    ).toBe("missed");
  });
});

describe("cancelled then validated — the case the founder's row will hit", () => {
  const cancelledThenValidated = {
    attendanceState: "missed",
    cancelledByStudent: false,
    cancelledAt: null,
    status: "absent",
    justification: "justified",
    validated: true,
  };

  it("shows the coach's record as the state", () => {
    expect(attendanceStateOf(cancelledThenValidated)).toBe("missed");
  });

  it("drops the cancellation detail once the coach has validated", () => {
    expect(cancellationDetail(cancelledThenValidated, "coach")).toBeNull();
  });
});

describe("labels — one state word, and the right person is speaking", () => {
  it("speaks to the student in the second person and about them to the coach", () => {
    expect(attendanceStateLabelKey("coming", "student")).toBe("calendar.attendanceState.coming.student");
    expect(attendanceStateLabelKey("coming", "coach")).toBe("calendar.attendanceState.coming.coach");
    expect(attendanceStateLabelKey("not_coming", "student")).toBe(
      "calendar.attendanceState.not_coming.student"
    );
    expect(attendanceStateLabelKey("not_coming", "coach")).toBe(
      "calendar.attendanceState.not_coming.coach"
    );
  });

  it("gives every state a key for both audiences", () => {
    for (const state of ATTENDANCE_STATES) {
      for (const audience of ["student", "coach"] as const) {
        expect(attendanceStateLabelKey(state, audience)).toMatch(
          /^calendar\.attendanceState\.[a-z_]+\.(student|coach)$/
        );
      }
    }
  });

  it("tones the five states so the badge colour cannot contradict the word", () => {
    expect(attendanceStateTone("planned")).toBe("neutral");
    expect(attendanceStateTone("coming")).toBe("positive");
    expect(attendanceStateTone("not_coming")).toBe("warning");
    expect(attendanceStateTone("attended")).toBe("positive");
    expect(attendanceStateTone("missed")).toBe("negative");
  });
});

describe("cancellationDetail — provenance, not a second state", () => {
  const studentCancelled = {
    attendanceState: "not_coming",
    cancelledByStudent: true,
    cancelledAt: "2026-09-20T09:30:00+00:00",
    validated: false,
  };

  it("is offered on the coach's row, where we know who cancelled", () => {
    expect(cancellationDetail(studentCancelled, "coach")).toEqual({
      key: "calendar.detail.cancelledByStudentAt",
      when: "2026-09-20T09:30:00+00:00",
    });
  });

  it("is never offered on the student's own row — they know they cancelled", () => {
    expect(cancellationDetail(studentCancelled, "student")).toBeNull();
  });

  it("needs both the flag and the instant", () => {
    expect(cancellationDetail({ cancelledByStudent: true, cancelledAt: null }, "coach")).toBeNull();
    expect(
      cancellationDetail({ cancelledByStudent: false, cancelledAt: "2026-09-20T09:30:00+00:00" }, "coach")
    ).toBeNull();
  });

  it("says nothing for a coach-recorded absence, which has no student provenance", () => {
    expect(
      cancellationDetail(
        { status: "absent", justification: "justified", validated: false },
        "coach"
      )
    ).toBeNull();
  });
});

describe("reminderHint — B-017's signal, demoted and conditional", () => {
  // Coordinator, 2026-09-12: "have they been asked yet?" is only an open question
  // while nobody has answered, so the line renders on `planned` and nowhere else.
  it("is offered while the row is planned and a reminder went out", () => {
    expect(reminderHint({ reminderSentAt: "2026-09-18T08:00:00+00:00" })).toBe(
      "calendar.attendanceState.reminderSent"
    );
  });

  it("is silent on planned with no reminder — the absence is the signal", () => {
    expect(reminderHint({ reminderSentAt: null })).toBeNull();
    expect(reminderHint({})).toBeNull();
    expect(reminderHint(null)).toBeNull();
  });

  it("is silent on every state that is not planned, however the state was reached", () => {
    for (const state of ["coming", "not_coming", "attended", "missed"] as const) {
      expect(
        reminderHint({ attendanceState: state, reminderSentAt: "2026-09-18T08:00:00+00:00" })
      ).toBeNull();
    }
    // and on a derived row too, not only a server-served one
    expect(
      reminderHint({ confirmed: true, reminderSentAt: "2026-09-18T08:00:00+00:00" })
    ).toBeNull();
  });
});
