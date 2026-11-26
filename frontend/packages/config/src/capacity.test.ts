import { describe, expect, it } from "vitest";
import cases from "./confirmed-spots.cases.json";
import { capacityBarOf, confirmedSpotsOf, effectiveFilledSpots, effectiveFilledSpotsOf, participantsHeader, viewFilledSpots } from "./capacity";

describe("effectiveFilledSpots (PAD-71)", () => {
  it("[CLASSES-INSTANCE-ENROLLMENT-9] subtracts declined students from the enrolment count", () => {
    // Ticket example: 6 enrolled, 3 declined -> 3 filled spots.
    const presences = [
      { status: "absent" },
      { status: "absent" },
      { status: "absent" },
      { status: null },
      { status: null },
      { status: null },
    ];
    expect(effectiveFilledSpots(6, presences)).toBe(3);
  });

  it("[CLASSES-INSTANCE-ENROLLMENT-9] counts students who have not answered yet", () => {
    expect(effectiveFilledSpots(4, [])).toBe(4);
    expect(effectiveFilledSpots(4, undefined)).toBe(4);
    expect(effectiveFilledSpots(4, null)).toBe(4);
  });

  it("[CLASSES-INSTANCE-ENROLLMENT-9] counts students marked present", () => {
    expect(
      effectiveFilledSpots(3, [
        { status: "present" },
        { status: "present" },
        { status: "present" },
      ])
    ).toBe(3);
  });

  it("never goes below zero", () => {
    expect(
      effectiveFilledSpots(1, [{ status: "absent" }, { status: "absent" }])
    ).toBe(0);
  });
});

describe("effectiveFilledSpotsOf (calendar.event-detail rule 5, B-240)", () => {
  // Saved roster: Ana declined, Bruno coming.
  const presences = [
    { playerId: 1, status: "absent" },
    { playerId: 2, status: null },
  ];

  it("counts the same as effectiveFilledSpots when the list and the presences agree", () => {
    expect(effectiveFilledSpotsOf([{ id: "1" }, { id: "2" }], presences)).toBe(1);
  });

  it("[CALENDAR-EVENT-DETAIL-12] does not subtract a declined student who is no longer listed (an edit's unticked student)", () => {
    expect(effectiveFilledSpotsOf([{ id: "2" }], presences)).toBe(1);
  });

  it("a newly ticked student with no presence row fills a spot", () => {
    expect(effectiveFilledSpotsOf([{ id: "2" }, { id: "3" }], presences)).toBe(2);
  });

  it("matches ids across number and string", () => {
    expect(effectiveFilledSpotsOf([{ id: 2 }], [{ playerId: "2", status: "absent" }])).toBe(0);
  });
});

describe("participantsHeader (PAD-771, calendar.event-detail rule 5)", () => {
  it("[CALENDAR-EVENT-DETAIL-2] counts the filled spots and names the open ones: 16 enrolled, 4 not coming", () => {
    expect(participantsHeader(12, 16)).toEqual({
      key: "calendar.participants.open",
      values: { current: 12, max: 16, count: 4 },
    });
  });

  it("[CALENDAR-EVENT-DETAIL-2] reads full when no spot is open", () => {
    expect(participantsHeader(16, 16)).toEqual({ key: "calendar.participants.full", values: { current: 16, max: 16 } });
    expect(participantsHeader(17, 16).key).toBe("calendar.participants.full");
  });

  it("shows the count alone without a capacity", () => {
    expect(participantsHeader(3, 0)).toEqual({ key: "calendar.participants.filledNoMax", values: { current: 3 } });
    expect(participantsHeader(3, null).key).toBe("calendar.participants.filledNoMax");
  });
});

describe("confirmedSpotsOf (calendar.view rule 25, calendar.event-detail rule 27)", () => {
  const listed = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }];
  const rows = [
    { playerId: "1", status: "present" },
    { playerId: "2", status: null, confirmed: true }, // answered yes
    { playerId: "3", status: "absent", confirmed: true }, // a decline also writes `confirmed`
    // 4 has no row: unanswered
    { playerId: "9", status: "present" }, // not on the list
  ];

  it("[CALENDAR-EVENT-DETAIL-40] confirmedSpotsOf counts the listed students who are coming or came", () => {
    expect(confirmedSpotsOf(listed, rows)).toBe(2);
    expect(confirmedSpotsOf(listed, rows)).toBeLessThanOrEqual(effectiveFilledSpotsOf(listed, rows));
    expect(confirmedSpotsOf(listed, [])).toBe(0);
    expect(confirmedSpotsOf(listed, undefined)).toBe(0);
  });

  it("[CALENDAR-EVENT-DETAIL-40] never counts more than the filled spots, whatever the rows say", () => {
    const dup = [
      { playerId: "1", status: "present" },
      { playerId: "1", status: "present" },
      { playerId: 2, status: "present" },
    ];
    expect(confirmedSpotsOf([{ id: 1 }, { id: "2" }], dup)).toBeLessThanOrEqual(2);
  });

  it("[CALENDAR-VIEW-32] confirmedSpotsOf counts who is coming", () => {
    // The server twin reads the same table: backend/padel_app/tests/test_confirmed_means_coming.py.
    for (const c of cases) {
      const row = [{ playerId: "1", status: c.status, confirmed: c.confirmed, validated: c.validated }];
      expect(confirmedSpotsOf([{ id: 1 }], row), JSON.stringify(c)).toBe(c.counts ? 1 : 0);
    }
  });
});

describe("capacityBarOf (calendar.event-detail rule 27, UI idea 3)", () => {
  const base = { capacity: 8, filled: 5, status: "scheduled", ended: false, canManage: true, editing: false };

  it("[CALENDAR-EVENT-DETAIL-41] draws the bar amber for a coach reading a class with a free seat", () => {
    expect(capacityBarOf(base)).toEqual({ tone: "warning" });
  });

  it("[CALENDAR-EVENT-DETAIL-41] draws in the box's own colour when full, ended, or completed", () => {
    expect(capacityBarOf({ ...base, filled: 8 })).toEqual({ tone: "current" });
    expect(capacityBarOf({ ...base, ended: true })).toEqual({ tone: "current" });
    expect(capacityBarOf({ ...base, status: "completed" })).toEqual({ tone: "current" });
  });

  it("[CALENDAR-EVENT-DETAIL-42] draws no bar while editing, canceled, with no capacity, or for a student", () => {
    expect(capacityBarOf({ ...base, editing: true })).toBeNull();
    expect(capacityBarOf({ ...base, status: "canceled" })).toBeNull();
    expect(capacityBarOf({ ...base, capacity: 0 })).toBeNull();
    expect(capacityBarOf({ ...base, canManage: false })).toBeNull();
  });
});

describe("viewFilledSpots (calendar.event-detail rule 5, PO M-7512)", () => {
  it("[CALENDAR-EVENT-DETAIL-49] a student takes the payload's count over a recount of their own row", () => {
    expect(viewFilledSpots(2, false, 1)).toBe(2);
    expect(viewFilledSpots(0, false, 1)).toBe(0);
  });

  it("[CALENDAR-EVENT-DETAIL-49] an older server (no count) keeps the local count", () => {
    expect(viewFilledSpots(undefined, false, 1)).toBe(1);
    expect(viewFilledSpots(null, false, 1)).toBe(1);
  });

  it("[CALENDAR-EVENT-DETAIL-49] the coach keeps the local count (B-240 draft, PAD-771 header)", () => {
    expect(viewFilledSpots(2, true, 3)).toBe(3);
  });
});
