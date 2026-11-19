/**
 * PAD-839 (dashboard.student-setup-guide rules 9, 10, 18): the schedule editor's logic, shared by
 * web and iOS. A day is 48 half-hour slots from 00:00 to 24:00; a period is a run of busy slots
 * `[start, end)`, so periods that overlap or touch are one. Days are JS `getDay` numbers
 * (0 = Sunday); the design lists them Seg … Dom (`SCHEDULE_WEEK_ORDER`).
 */
import { BLOCKER_DEFAULT_MONTHS, plusMonths } from "./blocker-draft";

export const SCHEDULE_SLOTS = 48;
/** `const:SCHEDULE_STEP_MINUTES` */
export const SCHEDULE_STEP_MINUTES = 30;
/** `const:SCHEDULE_GRID_FIRST_HOUR`, `const:SCHEDULE_GRID_LAST_HOUR`, `const:SCHEDULE_GRID_COLUMNS` */
export const SCHEDULE_GRID_FIRST_HOUR = 6;
export const SCHEDULE_GRID_LAST_HOUR = 23;
export const SCHEDULE_GRID_COLUMNS = 6;
/** `const:SCHEDULE_DAY_END`: a period ending at 24:00 is stored with this end (OQ-F). */
export const SCHEDULE_DAY_END = "23:59";
/** `const:SCHEDULE_NAME_SUGGESTIONS` */
export const SCHEDULE_NAME_SUGGESTIONS = ["Trabalho", "Escola", "Ginásio", "Família", "Rotina"] as const;
/** The design's day order, Seg … Dom, as JS `getDay` numbers. */
export const SCHEDULE_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type Slots = boolean[];
export type ScheduleMode = "same" | "varies";

export interface Schedule {
  mode: ScheduleMode;
  /** Chosen days in "Igual", indexed by `getDay`. */
  days: boolean[];
  /** The periods every chosen day shares in "Igual". */
  shared: Slots;
  /** Each day's periods in "Varia", indexed by `getDay`. */
  perDay: Slots[];
  /** The day open in "Varia" (`getDay`). */
  open: number;
  /** The chosen name chip, or null. */
  name: string | null;
}

export interface Period {
  start: number;
  end: number;
}

export interface SchedulePreset {
  key: "work_weekdays" | "school_weekdays" | "weekends";
  label: string;
  title: string;
  days: number[];
  start: number;
  end: number;
}

/** `const:SCHEDULE_PRESETS` (slots: 09:00 = 18, 18:00 = 36, 08:00 = 16, 17:00 = 34; all day = 0–48). */
export const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  { key: "work_weekdays", label: "Trabalho em dias úteis", title: "Trabalho", days: [1, 2, 3, 4, 5], start: 18, end: 36 },
  { key: "school_weekdays", label: "Aulas ou escola", title: "Escola", days: [1, 2, 3, 4, 5], start: 16, end: 34 },
  { key: "weekends", label: "Fins de semana", title: "Fins de semana", days: [6, 0], start: 0, end: SCHEDULE_SLOTS },
];

export function emptySlots(): Slots {
  return Array.from({ length: SCHEDULE_SLOTS }, () => false);
}

export function emptySchedule(): Schedule {
  return {
    mode: "same",
    days: Array.from({ length: 7 }, () => false),
    shared: emptySlots(),
    perDay: Array.from({ length: 7 }, () => emptySlots()),
    open: SCHEDULE_WEEK_ORDER[0],
    name: null,
  };
}

function fill(slots: Slots, start: number, end: number, value = true): Slots {
  const out = slots.slice();
  for (let i = Math.max(0, start); i < Math.min(SCHEDULE_SLOTS, end); i++) out[i] = value;
  return out;
}

export function anySlot(slots: Slots): boolean {
  return slots.some(Boolean);
}

/** The runs of busy slots, in order. */
export function periodsOf(slots: Slots): Period[] {
  const out: Period[] = [];
  let i = 0;
  while (i < SCHEDULE_SLOTS) {
    if (slots[i]) {
      let j = i;
      while (j < SCHEDULE_SLOTS && slots[j]) j++;
      out.push({ start: i, end: j });
      i = j;
    } else i++;
  }
  return out;
}

/** Slot → "HH:MM"; 48 → "24:00" (display). */
export function slotLabel(slot: number): string {
  const m = slot * SCHEDULE_STEP_MINUTES;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Slot → the stored "HH:MM" (48 → `SCHEDULE_DAY_END`). */
export function slotToTime(slot: number): string {
  return slot >= SCHEDULE_SLOTS ? SCHEDULE_DAY_END : slotLabel(slot);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** A stored start, rounded down to its slot (rule 9: a block only grows). */
export function startTimeToSlot(hhmm: string): number {
  return Math.floor(minutesOf(hhmm) / SCHEDULE_STEP_MINUTES);
}

/** A stored end, rounded up to its slot; `SCHEDULE_DAY_END` reads back as 48 (24:00). */
export function endTimeToSlot(hhmm: string): number {
  if (hhmm === SCHEDULE_DAY_END) return SCHEDULE_SLOTS;
  return Math.min(SCHEDULE_SLOTS, Math.ceil(minutesOf(hhmm) / SCHEDULE_STEP_MINUTES));
}

// ── the grid ──────────────────────────────────────────────────────────────────────────────────

export interface GridState {
  slots: Slots;
  /** The hour marked as a start, waiting for the second tap; null when none. */
  anchor: number | null;
}

/**
 * Rule 9. With no start pending, a tap on a fully busy hour frees it; any other tap marks a start.
 * With a start pending, taps on two different hours fill `[min, max)`; the same hour twice fills
 * `[h, h+1)`.
 */
export function gridTap(state: GridState, hour: number): GridState {
  const { slots, anchor } = state;
  if (anchor === null) {
    if (slots[hour * 2] && slots[hour * 2 + 1]) return { slots: fill(slots, hour * 2, hour * 2 + 2, false), anchor: null };
    return { slots, anchor: hour };
  }
  const from = Math.min(anchor, hour);
  const to = from === Math.max(anchor, hour) ? from + 1 : Math.max(anchor, hour);
  return { slots: fill(slots, from * 2, to * 2), anchor: null };
}

export type HourCell = "busy" | "half" | "free_end" | "anchor" | "free";

/** How an hour cell is drawn (rule 9's cell looks). */
export function hourCell(state: GridState, hour: number): HourCell {
  if (state.anchor === hour) return "anchor";
  const a = state.slots[hour * 2];
  const b = state.slots[hour * 2 + 1];
  if (!a && hour > 0 && state.slots[hour * 2 - 1]) return "free_end";
  if (a && b) return "busy";
  if (a || b) return "half";
  return "free";
}

/** The hint's step over the grid: 1 with no period, 2 while a start is pending, else 3. */
export function gridHint(state: GridState): 1 | 2 | 3 {
  if (state.anchor !== null) return 2;
  return periodsOf(state.slots).length ? 3 : 1;
}

/** The grid's hours, `SCHEDULE_GRID_FIRST_HOUR` … `SCHEDULE_GRID_LAST_HOUR`. */
export function gridHours(): number[] {
  const out: number[] = [];
  for (let h = SCHEDULE_GRID_FIRST_HOUR; h <= SCHEDULE_GRID_LAST_HOUR; h++) out.push(h);
  return out;
}

// ── periods: − / + and × ──────────────────────────────────────────────────────────────────────

export type PeriodEdge = "start" | "end";

/**
 * Rule 9: move an edge one step. Start − needs a start above 00:00; end + needs an end below 24:00;
 * start + and end − keep the period at least one step long. A period grown into its neighbour merges.
 */
export function stepPeriod(slots: Slots, period: Period, edge: PeriodEdge, direction: 1 | -1): Slots {
  const { start, end } = period;
  if (edge === "start" && direction === -1) return start > 0 ? fill(slots, start - 1, start) : slots;
  if (edge === "start" && direction === 1) return end - start > 1 ? fill(slots, start, start + 1, false) : slots;
  if (edge === "end" && direction === -1) return end - start > 1 ? fill(slots, end - 1, end, false) : slots;
  return end < SCHEDULE_SLOTS ? fill(slots, end, end + 1) : slots;
}

export function removePeriod(slots: Slots, period: Period): Slots {
  return fill(slots, period.start, period.end, false);
}

/** "2 h", "4 h 30". */
export function periodLength(period: Period): string {
  const mins = (period.end - period.start) * SCHEDULE_STEP_MINUTES;
  const rest = mins % 60;
  return `${Math.floor(mins / 60)} h${rest ? ` ${rest}` : ""}`;
}

// ── the schedule: days, modes, copy ───────────────────────────────────────────────────────────

/** The slots currently in view: the shared ones in "Igual", the open day's in "Varia". */
export function slotsInView(s: Schedule): Slots {
  return s.mode === "same" ? s.shared : s.perDay[s.open];
}

export function withSlotsInView(s: Schedule, slots: Slots): Schedule {
  if (s.mode === "same") return { ...s, shared: slots };
  const perDay = s.perDay.slice();
  perDay[s.open] = slots;
  return { ...s, perDay };
}

export function setDays(s: Schedule, days: number[]): Schedule {
  return { ...s, days: Array.from({ length: 7 }, (_, d) => days.includes(d)) };
}

export function toggleDay(s: Schedule, day: number): Schedule {
  const days = s.days.slice();
  days[day] = !days[day];
  return { ...s, days };
}

/** "Igual" → "Varia": the shared periods go to every chosen day; the first chosen day opens. */
export function toVaries(s: Schedule): Schedule {
  if (s.mode === "varies") return s;
  const perDay = s.days.map((on) => (on ? s.shared.slice() : emptySlots()));
  const first = SCHEDULE_WEEK_ORDER.find((d) => s.days[d]);
  return { ...s, mode: "varies", perDay, open: first ?? SCHEDULE_WEEK_ORDER[0] };
}

/** "Varia" → "Igual": the open day's periods become the shared ones; every day with periods is chosen. */
export function toSame(s: Schedule): Schedule {
  if (s.mode === "same") return s;
  return { ...s, mode: "same", shared: s.perDay[s.open].slice(), days: s.perDay.map(anySlot) };
}

/** "Copiar {dia} para…": the open day's periods replace each target's. */
export function copyOpenDayTo(s: Schedule, targets: number[]): Schedule {
  const perDay = s.perDay.slice();
  for (const d of targets) if (d !== s.open) perDay[d] = s.perDay[s.open].slice();
  return { ...s, perDay };
}

/** The busy slots of each day (`getDay` index) as they will be saved. */
export function weekSlots(s: Schedule): Slots[] {
  return s.mode === "same" ? s.days.map((on) => (on ? s.shared.slice() : emptySlots())) : s.perDay.map((x) => x.slice());
}

/** Save is enabled when "Igual" has a day and a period, or "Varia" has a period on any day. */
export function canSave(s: Schedule): boolean {
  return s.mode === "same" ? s.days.some(Boolean) && anySlot(s.shared) : s.perDay.some(anySlot);
}

/** "A tua semana": "09–11 · 15–20" (a half hour reads "13:30"), or "Livre". */
export function weekRowText(slots: Slots, free = "Livre"): string {
  const short = (slot: number) => (slot % 2 ? slotLabel(slot) : slotLabel(slot).slice(0, 2));
  const ps = periodsOf(slots);
  return ps.length ? ps.map((p) => `${short(p.start)}–${short(p.end)}`).join(" · ") : free;
}

// ── the summary sentence ──────────────────────────────────────────────────────────────────────

const PT_DAY_FULL: Record<number, string> = {
  1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado", 0: "domingo",
};
const PT_DAY_SHORT: Record<number, string> = { 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sáb", 0: "dom" };

function joinPt(parts: string[]): string {
  return parts.length <= 1 ? parts[0] ?? "" : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Rule 9's summary, in "Igual" (Portuguese, the design's wording); null in "Varia". */
export function scheduleSummary(s: Schedule): string | null {
  if (s.mode !== "same") return null;
  const sel = SCHEDULE_WEEK_ORDER.filter((d) => s.days[d]);
  const ps = periodsOf(s.shared);
  if (!sel.length && !ps.length) return "Escolhe os dias e toca nas horas em que estás ocupado.";
  if (!sel.length) return "Falta escolher os dias.";
  if (!ps.length) return "Falta marcar as horas ocupadas.";
  const key = SCHEDULE_WEEK_ORDER.map((d) => (s.days[d] ? 1 : 0)).join("");
  let dayText: string;
  if (sel.length === 7) dayText = "todos os dias";
  else if (key === "1111100") dayText = "de segunda a sexta";
  else if (key === "0000011") dayText = "ao fim de semana";
  else if (sel.length === 1) dayText = `${sel[0] === 6 || sel[0] === 0 ? "ao" : "à"} ${PT_DAY_FULL[sel[0]]}`;
  else dayText = `à ${joinPt(sel.map((d) => PT_DAY_SHORT[d]))}`;
  const hourText = joinPt(ps.map((p) => `das ${slotLabel(p.start)} às ${slotLabel(p.end)}`));
  return `Não recebes convites nem lembretes ${dayText}, ${hourText}.`;
}

// ── to rows and back (rule 10) ────────────────────────────────────────────────────────────────

/** The payload of one schedule row (the api package's `BlockerInput`). */
export interface ScheduleRowInput {
  title: string | null;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: true;
  recurrenceRule: { frequency: "weekly"; daysOfWeek: number[] };
  endDate: string;
}

/**
 * One weekly row per distinct interval, on every day that has it. "Igual" with k periods on D days
 * gives k rows on D; "Varia" coalesces equal intervals across days.
 */
export function scheduleToBlockerInputs(
  s: Schedule,
  { startDate, endDate }: { startDate: string; endDate: string }
): ScheduleRowInput[] {
  const byInterval = new Map<string, { period: Period; days: number[] }>();
  weekSlots(s).forEach((slots, day) => {
    for (const p of periodsOf(slots)) {
      const key = `${p.start}-${p.end}`;
      const entry = byInterval.get(key) ?? { period: p, days: [] };
      entry.days.push(day);
      byInterval.set(key, entry);
    }
  });
  return [...byInterval.values()]
    .sort((a, b) => a.period.start - b.period.start || a.period.end - b.period.end)
    .map(({ period, days }) => ({
      title: s.name,
      date: startDate,
      startTime: slotToTime(period.start),
      endTime: slotToTime(period.end),
      isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: days.slice().sort((a, b) => a - b) },
      endDate,
    }));
}

/** The parts of a saved row the editor reads. */
export interface ScheduleRow {
  id: number;
  title: string | null;
  startTime: string | null;
  endTime: string | null;
  recurrenceRule: { daysOfWeek?: number[] | null } | null;
  recurrenceEnd: string | null;
}

/**
 * The week a schedule's rows describe (times widened to whole slots). It opens in "Igual" when every
 * day with periods has the same periods, else in "Varia" on the first day with periods. The name is
 * the newest row's title.
 */
export function blockersToSchedule(rows: ScheduleRow[]): Schedule {
  const s = emptySchedule();
  const perDay = s.perDay.map((x) => x.slice());
  for (const row of rows) {
    if (!row.startTime || !row.endTime) continue;
    const start = startTimeToSlot(row.startTime);
    const end = endTimeToSlot(row.endTime);
    for (const d of row.recurrenceRule?.daysOfWeek ?? []) perDay[d] = fill(perDay[d], start, end);
  }
  const newest = rows.slice().sort((a, b) => b.id - a.id)[0];
  const name = newest?.title ?? null;
  const withPeriods = SCHEDULE_WEEK_ORDER.filter((d) => anySlot(perDay[d]));
  const same = withPeriods.every((d) => perDay[d].join() === perDay[withPeriods[0]].join());
  if (same) {
    return {
      ...s,
      name,
      days: perDay.map(anySlot),
      shared: withPeriods.length ? perDay[withPeriods[0]].slice() : emptySlots(),
      perDay,
    };
  }
  return { ...s, name, mode: "varies", perDay, open: withPeriods[0] };
}

/** A preset as a schedule in "Igual". */
export function presetSchedule(key: SchedulePreset["key"]): Schedule {
  const p = SCHEDULE_PRESETS.find((x) => x.key === key)!;
  return { ...setDays(emptySchedule(), p.days), shared: fill(emptySlots(), p.start, p.end), name: p.title };
}

// ── the end date and "Prolongar" (rule 18, Q7 (a)) ───────────────────────────────────────────

/** A schedule's end: the latest `recurrenceEnd` of its rows, or null. */
export function scheduleEnd(rows: { recurrenceEnd: string | null }[]): string | null {
  return rows.reduce<string | null>((max, r) => (r.recurrenceEnd && (!max || r.recurrenceEnd > max) ? r.recurrenceEnd : max), null);
}

/** "Termina a" while the end is today or later; "Terminou a" after. */
export function scheduleEndState(end: string, todayISO: string): "ends" | "ended" {
  return end >= todayISO ? "ends" : "ended";
}

/** "Prolongar": the later of today and the current end, plus the default length. */
export function prolongedEnd(currentEnd: string | null, todayISO: string): string {
  const from = currentEnd && currentEnd > todayISO ? currentEnd : todayISO;
  return plusMonths(from, BLOCKER_DEFAULT_MONTHS);
}

/** A new schedule's end: today plus the default length (`calendar.student-blockers` rule 16). */
export function newScheduleEnd(todayISO: string): string {
  return plusMonths(todayISO, BLOCKER_DEFAULT_MONTHS);
}

/**
 * A new schedule id (UUID v4 shape). `crypto.randomUUID` is not on every engine both shells run
 * (Hermes), so this uses `getRandomValues` when present and `Math.random` otherwise; the id only
 * groups one student's rows, and the server refuses another student's id.
 */
export function newScheduleId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The saved schedules among a student's blockers: rows grouped by `scheduleId`, newest first. */
export function savedSchedules<T extends ScheduleRow & { scheduleId?: string | null }>(
  rows: T[]
): { scheduleId: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) if (r.scheduleId) groups.set(r.scheduleId, [...(groups.get(r.scheduleId) ?? []), r]);
  return [...groups.entries()]
    .map(([scheduleId, rs]) => ({ scheduleId, rows: rs }))
    .sort((a, b) => Math.max(...b.rows.map((r) => r.id)) - Math.max(...a.rows.map((r) => r.id)));
}

/** "Prolongar": the same rows, each with the new end (rule 18). */
export function rowsWithEnd(
  rows: (ScheduleRow & { date: string | null })[],
  endDate: string
): ScheduleRowInput[] {
  return rows
    .filter((r) => r.date && r.startTime && r.endTime)
    .map((r) => ({
      title: r.title,
      date: r.date!,
      startTime: r.startTime!,
      endTime: r.endTime!,
      isRecurring: true as const,
      recurrenceRule: { frequency: "weekly" as const, daysOfWeek: (r.recurrenceRule?.daysOfWeek ?? []).slice() },
      endDate,
    }));
}

/** The step-3 preview: "seg, ter, qua, qui, sex" and "09:00 – 18:00" for a schedule in "Igual". */
export function scheduleDaysText(s: Schedule): string {
  return SCHEDULE_WEEK_ORDER.filter((d) => s.days[d]).map((d) => PT_DAY_SHORT[d]).join(", ");
}
