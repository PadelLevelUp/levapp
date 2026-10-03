/**
 * classes.join-requests rule 17 (PAD-460): the merge/split rule behind both
 * shells' ClassRequestsSection — the mobile unit runner cannot mount a
 * component, so this is where the merge, sort and open/closed split are
 * proven (web's component test covers the rendering on top of it).
 */
import { describe, expect, it } from "vitest";
import type { ClassJoinRequestListRow, ClassRequest, ClassWaitingListRow } from "@levelup/types";
import { isOpenClassRequestRow, mergeClassRequestRows, splitClassRequestRows } from "./class-request-list";

function privateRow(overrides: Partial<ClassRequest>): ClassRequest {
  return {
    id: 1,
    playerId: "p1",
    playerName: "Bruno",
    coachId: "c1",
    coachName: "Ana",
    date: "2026-10-06",
    startTime: "18:00",
    endTime: "19:00",
    note: null,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    lessonId: null,
    createdAt: "2026-10-01T10:00:00Z",
    participants: [],
    recurrence: null,
    ...overrides,
  };
}

function academyRow(overrides: Partial<ClassJoinRequestListRow>): ClassJoinRequestListRow {
  return {
    id: 100,
    lessonInstanceId: "50",
    playerId: "p2",
    playerName: "Carla",
    coachId: "c1",
    status: "pending",
    createdAt: "2026-10-01T09:00:00Z",
    decidedAt: null,
    note: null,
    kind: "academy",
    classTitle: "Terça 18h",
    date: "2026-10-06",
    startTime: "18:00",
    endTime: "19:00",
    ...overrides,
  };
}

describe("mergeClassRequestRows (rule 17)", () => {
  it("merges private and academy rows newest first by createdAt", () => {
    const older = privateRow({ id: 1, createdAt: "2026-10-01T08:00:00Z" });
    const newest = academyRow({ id: 100, createdAt: "2026-10-01T12:00:00Z" });
    const middle = privateRow({ id: 2, createdAt: "2026-10-01T10:00:00Z" });

    const merged = mergeClassRequestRows([older, middle], [newest]);

    expect(merged.map((r) => (r.kind === "academy" ? `academy-${r.id}` : `private-${r.id}`))).toEqual([
      "academy-100",
      "private-2",
      "private-1",
    ]);
  });

  it("tags private rows with kind: 'private' and keeps academy rows' own kind: 'academy'", () => {
    const [merged] = mergeClassRequestRows([privateRow({ id: 1 })], []);
    expect(merged.kind).toBe("private");
    const [academyMerged] = mergeClassRequestRows([], [academyRow({ id: 100 })]);
    expect(academyMerged.kind).toBe("academy");
  });
});

describe("isOpenClassRequestRow / splitClassRequestRows (rule 17)", () => {
  it("a private row is open for pending and countered, closed otherwise", () => {
    expect(isOpenClassRequestRow({ kind: "private", ...privateRow({ status: "pending" }) })).toBe(true);
    expect(isOpenClassRequestRow({ kind: "private", ...privateRow({ status: "countered" }) })).toBe(true);
    for (const status of ["accepted", "declined", "withdrawn"] as const) {
      expect(isOpenClassRequestRow({ kind: "private", ...privateRow({ status }) })).toBe(false);
    }
  });

  it("an academy row is open only for pending, closed for every other status", () => {
    expect(isOpenClassRequestRow(academyRow({ status: "pending" }))).toBe(true);
    for (const status of ["accepted", "rejected", "withdrawn", "superseded"] as const) {
      expect(isOpenClassRequestRow(academyRow({ status }))).toBe(false);
    }
  });

  it("splits a merged list into open and closed, preserving order within each", () => {
    const rows = mergeClassRequestRows(
      [privateRow({ id: 1, status: "pending", createdAt: "2026-10-01T09:00:00Z" })],
      [
        academyRow({ id: 100, status: "accepted", createdAt: "2026-10-01T12:00:00Z" }),
        academyRow({ id: 101, status: "pending", createdAt: "2026-10-01T08:00:00Z" }),
      ]
    );

    const { open, closed } = splitClassRequestRows(rows);

    expect(open.map((r) => r.id)).toEqual([1, 101]);
    expect(closed.map((r) => r.id)).toEqual([100]);
  });
});

describe("PAD-504: the student's waiting lists join the same list (academy-class-booking rule 11)", () => {
  function waitingRow(overrides: Partial<ClassWaitingListRow>): ClassWaitingListRow {
    return {
      kind: "waiting_list",
      id: 9,
      lessonInstanceId: 90,
      classTitle: "Academia 5",
      date: "2026-10-09",
      startTime: "19:00",
      endTime: "20:00",
      coachName: "Ana",
      status: "active",
      joinedAt: "2026-10-02T09:00:00",
      createdAt: "2026-10-02T09:00:00",
      ...overrides,
    };
  }

  it("merges waiting-list rows newest first with the other two kinds", () => {
    const merged = mergeClassRequestRows(
      [privateRow({ id: 1, createdAt: "2026-10-01T10:00:00Z" })],
      [],
      [waitingRow({ id: 9, createdAt: "2026-10-03T10:00:00Z" })],
    );
    expect(merged.map((r) => `${r.kind}:${r.id}`)).toEqual(["waiting_list:9", "private:1"]);
  });

  it("an active waiting-list row is open; every other state is history", () => {
    expect(isOpenClassRequestRow(waitingRow({ status: "active" }))).toBe(true);
    for (const status of ["placed", "left", "passed", "canceled"] as const) {
      expect(isOpenClassRequestRow(waitingRow({ status }))).toBe(false);
    }
  });

  it("callers that pass two lists are unchanged", () => {
    expect(mergeClassRequestRows([privateRow({ id: 1 })], [])).toHaveLength(1);
  });
});
