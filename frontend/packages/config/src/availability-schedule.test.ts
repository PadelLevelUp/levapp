import { describe, expect, it } from "vitest";
import {
  SCHEDULE_DAY_END,
  SCHEDULE_NAME_SUGGESTIONS,
  blockersToSchedule,
  canSave,
  copyOpenDayTo,
  emptySchedule,
  emptySlots,
  gridHint,
  gridTap,
  hourCell,
  periodLength,
  periodsOf,
  presetSchedule,
  prolongedEnd,
  removePeriod,
  scheduleEnd,
  scheduleEndState,
  scheduleSummary,
  scheduleToBlockerInputs,
  setDays,
  slotLabel,
  slotsInView,
  stepPeriod,
  toSame,
  toVaries,
  weekRowText,
  weekSlots,
  withSlotsInView,
  type GridState,
  type Schedule,
  type Slots,
} from "./availability-schedule";

const DATES = { startDate: "2026-11-16", endDate: "2027-02-16" };

/** Taps on the grid of the slots in view, from no pending start. */
function tap(s: Schedule, ...hours: number[]): Schedule {
  let g: GridState = { slots: slotsInView(s), anchor: null };
  for (const h of hours) g = gridTap(g, h);
  return withSlotsInView(s, g.slots);
}

function labels(slots: Slots): string[] {
  return periodsOf(slots).map((p) => `${slotLabel(p.start)}–${slotLabel(p.end)}`);
}

describe("scheduleToBlockerInputs", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-10] same every day with two periods makes two rows on the chosen days", () => {
    const s = tap(setDays(emptySchedule(), [0, 1, 2, 3, 4, 5, 6]), 9, 11, 15, 20);
    expect(canSave(s)).toBe(true);
    const rows = scheduleToBlockerInputs(s, DATES);
    expect(rows.map((r) => [r.startTime, r.endTime, r.recurrenceRule.daysOfWeek])).toEqual([
      ["09:00", "11:00", [0, 1, 2, 3, 4, 5, 6]],
      ["15:00", "20:00", [0, 1, 2, 3, 4, 5, 6]],
    ]);
    expect(rows.every((r) => r.isRecurring && r.date === DATES.startDate && r.endDate === DATES.endDate)).toBe(true);
    expect(scheduleSummary(s)).toBe(
      "Não recebes convites nem lembretes todos os dias, das 09:00 às 11:00 e das 15:00 às 20:00."
    );
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-11] varies per day coalesces equal intervals and round-trips", () => {
    let s = tap(setDays(emptySchedule(), [1, 2, 3, 4, 5]), 9, 11, 15, 20);
    s = toVaries(s);
    expect(s.open).toBe(1);
    s = { ...s, open: 2 };
    s = withSlotsInView(s, emptySlots()); // Ter: Limpar
    s = tap(s, 9, 20);
    s = { ...s, open: 3 };
    s = withSlotsInView(s, removePeriod(slotsInView(s), periodsOf(slotsInView(s))[1])); // Qua: × on 15–20
    s = copyOpenDayTo({ ...s, open: 1 }, [4, 5]);

    const rows = scheduleToBlockerInputs(s, DATES);
    expect(rows.map((r) => [r.startTime, r.endTime, r.recurrenceRule.daysOfWeek])).toEqual([
      ["09:00", "11:00", [1, 3, 4, 5]],
      ["09:00", "20:00", [2]],
      ["15:00", "20:00", [1, 4, 5]],
    ]);
    const week = weekSlots(s);
    expect([1, 2, 3, 4, 5, 6, 0].map((d) => weekRowText(week[d]))).toEqual([
      "09–11 · 15–20", "09–20", "09–11", "09–11 · 15–20", "09–11 · 15–20", "Livre", "Livre",
    ]);

    const back = blockersToSchedule(
      rows.map((r, i) => ({ id: i + 1, title: null, startTime: r.startTime, endTime: r.endTime,
        recurrenceRule: r.recurrenceRule, recurrenceEnd: r.endDate }))
    );
    expect(back.mode).toBe("varies");
    expect(weekSlots(back)).toEqual(week);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-16] a preset is one weekly row titled by the preset", () => {
    const rows = scheduleToBlockerInputs(presetSchedule("work_weekdays"), DATES);
    expect(rows).toEqual([
      { title: "Trabalho", date: DATES.startDate, startTime: "09:00", endTime: "18:00", isRecurring: true,
        recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] }, endDate: DATES.endDate },
    ]);
    const weekend = scheduleToBlockerInputs(presetSchedule("weekends"), DATES);
    expect(weekend.map((r) => [r.startTime, r.endTime, r.recurrenceRule.daysOfWeek])).toEqual([
      ["00:00", SCHEDULE_DAY_END, [0, 6]],
    ]);
  });
});

describe("the grid", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-12] grid taps make, merge, free and fill one hour", () => {
    let g: GridState = { slots: emptySlots(), anchor: null };
    expect(gridHint(g)).toBe(1);
    g = gridTap(g, 13);
    expect(gridHint(g)).toBe(2);
    expect(hourCell(g, 13)).toBe("anchor");
    g = gridTap(g, 9);
    expect(labels(g.slots)).toEqual(["09:00–13:00"]);
    expect(hourCell(g, 13)).toBe("free_end");
    expect(hourCell(g, 12)).toBe("busy");
    expect(gridHint(g)).toBe(3);
    g = gridTap(gridTap(g, 13), 15);
    expect(labels(g.slots)).toEqual(["09:00–15:00"]);
    g = gridTap(g, 10);
    expect(labels(g.slots)).toEqual(["09:00–10:00", "11:00–15:00"]);
    g = gridTap(gridTap(g, 18), 18);
    expect(labels(g.slots)).toEqual(["09:00–10:00", "11:00–15:00", "18:00–19:00"]);
    // "Limpar" empties the day in view (the editor calls withSlotsInView(s, emptySlots())).
    const cleared = withSlotsInView(withSlotsInView(setDays(emptySchedule(), [1]), g.slots), emptySlots());
    expect(labels(slotsInView(cleared))).toEqual([]);

    let half: GridState = { slots: emptySlots(), anchor: null };
    half = gridTap(gridTap(half, 9), 13);
    half = { ...half, slots: stepPeriod(half.slots, periodsOf(half.slots)[0], "end", 1) };
    const tapped = gridTap(half, 13);
    expect(tapped.anchor).toBe(13);
    expect(labels(tapped.slots)).toEqual(["09:00–13:30"]);
  });
});

describe("periods", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-13] the step moves edges by 30 minutes within the day", () => {
    let g = gridTap(gridTap({ slots: emptySlots(), anchor: null }, 9), 13);
    const plus = stepPeriod(g.slots, periodsOf(g.slots)[0], "end", 1);
    expect(labels(plus)).toEqual(["09:00–13:30"]);
    expect(hourCell({ slots: plus, anchor: null }, 13)).toBe("half");
    expect(periodLength(periodsOf(plus)[0])).toBe("4 h 30");

    const dayStart = withRange(0, 2);
    expect(stepPeriod(dayStart, periodsOf(dayStart)[0], "start", -1)).toEqual(dayStart);
    const dayEnd = withRange(46, 48);
    expect(stepPeriod(dayEnd, periodsOf(dayEnd)[0], "end", 1)).toEqual(dayEnd);
    expect(labels(stepPeriod(dayEnd, periodsOf(dayEnd)[0], "end", -1))).toEqual(["23:00–23:30"]);
    const oneStep = withRange(20, 21);
    expect(stepPeriod(oneStep, periodsOf(oneStep)[0], "start", 1)).toEqual(oneStep);
    expect(stepPeriod(oneStep, periodsOf(oneStep)[0], "end", -1)).toEqual(oneStep);
    const two = withRange(18, 22, withRange(23, 26));
    expect(labels(stepPeriod(two, periodsOf(two)[0], "end", 1))).toEqual(["09:00–13:00"]);

    const allDay = setDays({ ...emptySchedule(), shared: withRange(36, 48) }, [1]);
    const [row] = scheduleToBlockerInputs(allDay, DATES);
    expect(row.endTime).toBe(SCHEDULE_DAY_END);
    const reopened = blockersToSchedule([{ id: 1, title: null, startTime: row.startTime, endTime: row.endTime,
      recurrenceRule: row.recurrenceRule, recurrenceEnd: row.endDate }]);
    expect(labels(reopened.shared)).toEqual(["18:00–24:00"]);

    const odd = blockersToSchedule([{ id: 1, title: null, startTime: "05:15", endTime: "06:40",
      recurrenceRule: { daysOfWeek: [1] }, recurrenceEnd: "2027-02-16" }]);
    expect(labels(odd.shared)).toEqual(["05:00–07:00"]);
  });
});

function withRange(start: number, end: number, base: Slots = emptySlots()): Slots {
  const out = base.slice();
  for (let i = start; i < end; i++) out[i] = true;
  return out;
}

describe("summary, modes and names", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-21] summary wording, mode switches and name chips", () => {
    const hours = (days: number[]) => tap(setDays(emptySchedule(), days), 9, 11, 15, 20);
    const tail = ", das 09:00 às 11:00 e das 15:00 às 20:00.";
    expect(scheduleSummary(hours([0, 1, 2, 3, 4, 5, 6]))).toBe(`Não recebes convites nem lembretes todos os dias${tail}`);
    expect(scheduleSummary(hours([1, 2, 3, 4, 5]))).toBe(`Não recebes convites nem lembretes de segunda a sexta${tail}`);
    expect(scheduleSummary(hours([6, 0]))).toBe(`Não recebes convites nem lembretes ao fim de semana${tail}`);
    expect(scheduleSummary(hours([2]))).toBe(`Não recebes convites nem lembretes à terça${tail}`);
    expect(scheduleSummary(hours([6]))).toBe(`Não recebes convites nem lembretes ao sábado${tail}`);
    expect(scheduleSummary(hours([1, 2, 3]))).toBe(`Não recebes convites nem lembretes à seg, ter e qua${tail}`);
    expect(scheduleSummary(emptySchedule())).toBe("Escolhe os dias e toca nas horas em que estás ocupado.");
    expect(scheduleSummary(setDays(emptySchedule(), [1]))).toBe("Falta marcar as horas ocupadas.");
    expect(scheduleSummary(tap(emptySchedule(), 9, 11))).toBe("Falta escolher os dias.");
    expect(canSave(tap(emptySchedule(), 9, 11))).toBe(false);
    expect(canSave(setDays(emptySchedule(), [1]))).toBe(false);

    const varies = toVaries(hours([2, 4]));
    expect(varies.open).toBe(2);
    expect(labels(varies.perDay[2])).toEqual(["09:00–11:00", "15:00–20:00"]);
    expect(labels(varies.perDay[1])).toEqual([]);
    const tueChanged = tap(varies, 18); // frees 18:00–19:00 on Ter
    const back = toSame(tueChanged);
    expect(labels(back.shared)).toEqual(["09:00–11:00", "15:00–18:00", "19:00–20:00"]);
    expect(back.days.map((on, d) => (on ? d : -1)).filter((d) => d >= 0)).toEqual([2, 4]);

    expect(SCHEDULE_NAME_SUGGESTIONS).toEqual(["Trabalho", "Escola", "Ginásio", "Família", "Rotina"]);
  });
});

describe("end date and Prolongar", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-28] schedule end and Prolongar's new end", () => {
    const today = "2026-11-19";
    const end = scheduleEnd([{ recurrenceEnd: "2027-01-01" }, { recurrenceEnd: "2027-02-19" }]);
    expect(end).toBe("2027-02-19");
    expect(scheduleEndState("2027-02-19", today)).toBe("ends");
    expect(scheduleEndState("2026-11-10", today)).toBe("ended");
    expect(prolongedEnd("2027-02-19", today)).toBe("2027-05-19");
    expect(prolongedEnd("2026-11-10", today)).toBe("2027-02-19");
    expect(prolongedEnd(null, today)).toBe("2027-02-19");
  });
});

describe("ids, saved schedules and Prolongar rows", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-14] a new schedule id, and the saved schedules newest first", async () => {
    const { newScheduleId, savedSchedules } = await import("./availability-schedule");
    expect(newScheduleId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const row = (id: number, scheduleId: string | null) => ({ id, scheduleId, title: null, startTime: "09:00",
      endTime: "11:00", recurrenceRule: { daysOfWeek: [1] }, recurrenceEnd: "2027-02-16" });
    const groups = savedSchedules([row(1, "a"), row(2, null), row(3, "b"), row(4, "a")]);
    expect(groups.map((g) => [g.scheduleId, g.rows.map((r) => r.id)])).toEqual([["a", [1, 4]], ["b", [3]]]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-28] Prolongar keeps every row and moves its end", async () => {
    const { rowsWithEnd } = await import("./availability-schedule");
    const rows = rowsWithEnd(
      [{ id: 1, title: "Trabalho", date: "2026-11-16", startTime: "09:00", endTime: "18:00",
        recurrenceRule: { daysOfWeek: [1, 2, 3, 4, 5] }, recurrenceEnd: "2027-02-16" }],
      "2027-05-19"
    );
    expect(rows).toEqual([{ title: "Trabalho", date: "2026-11-16", startTime: "09:00", endTime: "18:00",
      isRecurring: true, recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] }, endDate: "2027-05-19" }]);
  });
});

describe("card text and name chips", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-31] a saved schedule's card text in either mode", async () => {
    const { scheduleCardText } = await import("./availability-schedule");
    const same = tap(setDays(emptySchedule(), [0, 1, 2, 3, 4, 5, 6]), 9, 11, 15, 20);
    const sameBack = blockersToSchedule(
      scheduleToBlockerInputs(same, DATES).map((r, i) => ({ id: i + 1, title: null, startTime: r.startTime,
        endTime: r.endTime, recurrenceRule: r.recurrenceRule, recurrenceEnd: r.endDate }))
    );
    expect(scheduleCardText(sameBack)).toBe("seg, ter, qua, qui, sex, sáb, dom · 09–11 · 15–20");

    const rows = [
      { start: "09:00", end: "11:00", days: [1, 3, 4, 5] },
      { start: "09:00", end: "20:00", days: [2] },
      { start: "15:00", end: "20:00", days: [1, 4, 5] },
    ].map((r, i) => ({ id: i + 1, title: null, startTime: r.start, endTime: r.end,
      recurrenceRule: { daysOfWeek: r.days }, recurrenceEnd: "2027-02-16" }));
    const varies = blockersToSchedule(rows);
    expect(varies.mode).toBe("varies");
    const text = scheduleCardText(varies);
    expect(text).toBe("seg 09–11 · 15–20; ter 09–20; qua 09–11; qui 09–11 · 15–20; sex 09–11 · 15–20");
    expect(text).not.toContain("Livre");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-21] tapping a name chip chooses it, and tapping it again clears it", async () => {
    const { toggleName } = await import("./availability-schedule");
    const chosen = toggleName(emptySchedule(), "Ginásio");
    expect(chosen.name).toBe("Ginásio");
    expect(toggleName(chosen, "Escola").name).toBe("Escola");
    expect(toggleName(chosen, "Ginásio").name).toBeNull();
  });
});
