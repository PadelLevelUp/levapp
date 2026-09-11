import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  canCancelAttendance,
  canDeclineProactively,
  hasClassStarted,
  hasDeclined,
} from "./attendance-decline";

// The class in every fixture starts at 18:00 on 2026-09-10 (club wall clock); "now"
// is pinned a few days before it, on the club's clock (Lisbon summer, UTC+1) so the
// file passes in any zone (PAD-295), unless a test moves it.
const NOW = new Date("2026-09-06T12:00:00+01:00").getTime();

const student = {
  isCoach: false,
  isCanceled: false,
  ownPresence: { status: "confirmed", justification: null } as {
    status?: string | null;
    justification?: string | null;
  },
  canDeclineProactively: true,
  date: "2026-09-10",
  startTime: "18:00",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hasDeclined", () => {
  it("is true only for a JUSTIFIED absence", () => {
    expect(hasDeclined({ status: "absent", justification: "justified" })).toBe(true);
  });

  it("is false for an unjustified absence — that is a coach-marked no-show", () => {
    expect(hasDeclined({ status: "absent", justification: "unjustified" })).toBe(false);
    expect(hasDeclined({ status: "absent" })).toBe(false);
  });

  it("is false for a present or unanswered presence, and for none at all", () => {
    expect(hasDeclined({ status: "present" })).toBe(false);
    expect(hasDeclined({ status: null })).toBe(false);
    expect(hasDeclined(undefined)).toBe(false);
  });
});

describe("hasClassStarted", () => {
  it("is false before the start instant and true after it", () => {
    expect(hasClassStarted("2026-09-10", "18:00")).toBe(false);
    expect(hasClassStarted("2026-09-06", "09:00")).toBe(true);
  });

  it("is true exactly at the start instant", () => {
    const startAt = new Date("2026-09-06T18:00:00+01:00").getTime(); // the instant of 18:00 club time
    expect(hasClassStarted("2026-09-06", "18:00", startAt)).toBe(true);
  });

  it("reads a missing start time as midnight", () => {
    expect(hasClassStarted("2026-09-06", null)).toBe(true);
    expect(hasClassStarted("2026-09-07", "")).toBe(false);
  });

  it("reads an absent or unparseable date as not started, rather than hiding the action", () => {
    expect(hasClassStarted(undefined, "18:00")).toBe(false);
    expect(hasClassStarted("not-a-date", "18:00")).toBe(false);
  });
});

describe("canDeclineProactively", () => {
  it("is offered to an enrolled student while the server says the window is open", () => {
    expect(canDeclineProactively(student)).toBe(true);
  });

  it("is never offered to a coach", () => {
    expect(canDeclineProactively({ ...student, isCoach: true })).toBe(false);
  });

  it("closes when the SERVER says the window closed", () => {
    // The client never re-derives the reminder instant; this flag is the gate.
    expect(canDeclineProactively({ ...student, canDeclineProactively: false })).toBe(
      false
    );
    expect(
      canDeclineProactively({ ...student, canDeclineProactively: undefined })
    ).toBe(false);
  });

  it("is not offered once the class has started", () => {
    expect(
      canDeclineProactively({ ...student, date: "2026-09-06", startTime: "09:00" })
    ).toBe(false);
  });

  it("is not offered twice — it disappears once the student has declined", () => {
    expect(
      canDeclineProactively({
        ...student,
        ownPresence: { status: "absent", justification: "justified" },
      })
    ).toBe(false);
  });

  it("is not offered to someone with no presence on this class", () => {
    expect(canDeclineProactively({ ...student, ownPresence: null })).toBe(false);
  });

  it("is not offered on a cancelled class", () => {
    expect(canDeclineProactively({ ...student, isCanceled: true })).toBe(false);
  });
});

describe("canCancelAttendance", () => {
  it("stays available after the proactive window closes", () => {
    // The whole point of the split: the plain cancel is NOT window-gated, so a
    // late cancellation is still possible.
    const lateWindow = { ...student, canDeclineProactively: false };
    expect(canDeclineProactively(lateWindow)).toBe(false);
    expect(canCancelAttendance(lateWindow)).toBe(true);
  });

  it("is gone once the student is marked absent", () => {
    expect(
      canCancelAttendance({
        ...student,
        ownPresence: { status: "absent", justification: "justified" },
      })
    ).toBe(false);
  });

  it("is not offered to a coach, on a cancelled class, or with no presence", () => {
    expect(canCancelAttendance({ ...student, isCoach: true })).toBe(false);
    expect(canCancelAttendance({ ...student, isCanceled: true })).toBe(false);
    expect(canCancelAttendance({ ...student, ownPresence: undefined })).toBe(false);
  });
});

// ── B-060: Hermes may not parse an offset-less "YYYY-MM-DDTHH:MM" string ────
describe("hasClassStarted on Hermes (B-060)", () => {
  it("still sees a class that has started when string parsing yields Invalid Date", () => {
    const RealDate = Date;
    class HermesDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 1 && typeof args[0] === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(args[0])) {
          super(NaN);
        } else {
          super(...(args as ConstructorParameters<DateConstructor>));
        }
      }
    }
    vi.stubGlobal("Date", HermesDate);
    try {
      // The instant of 18:30 on the club's clock (PAD-295: fixtures are instants).
      const halfAnHourIn = new RealDate("2026-09-10T18:30:00+01:00").getTime();
      expect(hasClassStarted("2026-09-10", "18:00", halfAnHourIn)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * PAD-295 / B-066 — attendance.confirm rule 9, criterion "Started and late
 * cancellation are judged on the club's clock on any device". The default clock
 * is the club's, so `TZ=Asia/Tokyo` gives the same answers as Lisbon.
 */
describe("hasClassStarted defaults to the club's clock (PAD-295)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 09:00 UTC on 15 July 2027 = 10:00 in Lisbon (summer).
    vi.setSystemTime(new Date(Date.UTC(2027, 6, 15, 9, 0)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a class starting in 30 Lisbon minutes has not started on any device", () => {
    expect(hasClassStarted("2027-07-15", "10:30")).toBe(false);
  });

  it("a class that started 30 Lisbon minutes ago has started on any device", () => {
    expect(hasClassStarted("2027-07-15", "09:30")).toBe(true);
  });
});

// PAD-295 review (G-1): the device's own DST gap must not move the comparison.
describe("hasClassStarted on a Madrid device during its spring gap (PAD-295)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2027, 2, 28, 1, 30))); // 02:30 in Lisbon
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a 03:15 class has not started at 02:30 Lisbon, whatever the device's gap", () => {
    expect(hasClassStarted("2027-03-28", "03:15")).toBe(false);
  });
});
