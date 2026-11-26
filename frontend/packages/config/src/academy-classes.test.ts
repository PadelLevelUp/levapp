import { describe, expect, it } from "vitest";
import { academyClassAction, availabilityReadKey, groupAcademyClassesByDay, lessonMinutes, NOTE_MAX_LENGTH, readsPrivateLessons } from "./academy-classes";

const base = {
  id: "c1",
  date: "2026-09-18",
  startTime: "18:00",
  state: "open" as const,
  spotsLeft: 2,
  myJoinRequest: null,
  onWaitingList: false,
};

describe("classes.academy-class-booking rule 7: one action per class", () => {
  it("offers a request on an open class and the waiting list on a full one", () => {
    expect(academyClassAction(base)).toBe("request");
    expect(academyClassAction({ ...base, state: "full", spotsLeft: 0 })).toBe("join_waitlist");
  });

  it("shows what the student already did instead of an action", () => {
    expect(academyClassAction({ ...base, myJoinRequest: { id: 1, status: "pending" } })).toBe("requested");
    expect(academyClassAction({ ...base, state: "full", onWaitingList: true })).toBe("on_waitlist");
  });

  it("lets a closed request be asked again", () => {
    for (const status of ["rejected", "withdrawn", "superseded"] as const) {
      expect(academyClassAction({ ...base, myJoinRequest: { id: 1, status } })).toBe("request");
    }
  });

  it("the note limit matches the server's", () => {
    expect(NOTE_MAX_LENGTH).toBe(500);
  });
});

describe("rule 10: grouped by day, in time order", () => {
  it("groups by date and sorts days and classes", () => {
    const groups = groupAcademyClassesByDay([
      { ...base, id: "b", date: "2026-09-19", startTime: "09:00" },
      { ...base, id: "a2", date: "2026-09-18", startTime: "19:00" },
      { ...base, id: "a1", date: "2026-09-18", startTime: "08:00" },
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-09-18", "2026-09-19"]);
    expect(groups[0].classes.map((c) => c.id)).toEqual(["a1", "a2"]);
  });

  it("is empty for no classes", () => {
    expect(groupAcademyClassesByDay([])).toEqual([]);
  });
});

describe("classes.class-requests rule 13b (PAD-929): when the private step reads the private lessons", () => {
  it("only on a successful empty answer for the request on screen, with no invitees", () => {
    expect(readsPrivateLessons({ slotsState: "empty", answered: true, people: 1 })).toBe(true);
    expect(readsPrivateLessons({ slotsState: "empty", answered: false, people: 1 })).toBe(false);
    expect(readsPrivateLessons({ slotsState: "empty", answered: true, people: 2 })).toBe(false);
    for (const slotsState of ["waiting", "loading", "ready"] as const) {
      expect(readsPrivateLessons({ slotsState, answered: true, people: 1 })).toBe(false);
    }
  });

  it("keys an availability answer by what was asked", () => {
    const key = availabilityReadKey({ coachId: "ana", from: "2026-11-20", to: "2026-11-20", participants: [] });
    expect(key).toBe(availabilityReadKey({ coachId: "ana", from: "2026-11-20", to: "2026-11-20", participants: [] }));
    expect(key).not.toBe(availabilityReadKey({ coachId: "ana", from: "2026-11-21", to: "2026-11-21", participants: [] }));
  });

  it("measures a lesson's length from its times", () => {
    expect(lessonMinutes({ startTime: "18:00", endTime: "19:30" })).toBe(90);
  });
});
