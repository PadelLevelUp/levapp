/**
 * The student's Criar bloqueio sheet (calendar.student-blockers rules 15–16,
 * PAD-356): one draft shape, one validation, one payload builder, shared by
 * web and iOS so the two sheets cannot accept different blocks.
 */

export type BlockerMode = "single" | "recurring";

export interface BlockerDraft {
  /** The reason ("Motivo (opcional)"); stored in the blocker's `title`. */
  title: string;
  mode: BlockerMode;
  /** The single block's date, or the recurring block's start date (YYYY-MM-DD). */
  date: string;
  startTime: string;
  endTime: string;
  /** JS getDay() numbers (0 = Sunday); recurring only. */
  daysOfWeek: number[];
  /** Recurring end date (YYYY-MM-DD); "" means start date + 3 months. */
  endDate: string;
}

export type BlockerDraftError = "date_required" | "time_required" | "end_before_start" | "end_date_before_start_date";

/** The payload `POST/PUT /api/app/availability_blockers` takes (the api package's `BlockerInput`). */
export interface BlockerDraftInput {
  title: string | null;
  date: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
  recurrenceRule: { frequency: "weekly"; daysOfWeek: number[] } | null;
  endDate: string | null;
}

export function emptyBlockerDraft(): BlockerDraft {
  return { title: "", mode: "single", date: "", startTime: "18:00", endTime: "20:00", daysOfWeek: [], endDate: "" };
}

/** A stored blocker opened for editing. */
export function blockerToDraft(b: {
  title?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isRecurring: boolean;
  recurrenceRule?: { daysOfWeek?: number[] | null } | null;
  recurrenceEnd?: string | null;
}): BlockerDraft {
  return {
    title: b.title ?? "",
    mode: b.isRecurring ? "recurring" : "single",
    date: b.date ?? "",
    startTime: b.startTime ?? "18:00",
    endTime: b.endTime ?? "20:00",
    daysOfWeek: b.recurrenceRule?.daysOfWeek ?? [],
    endDate: b.recurrenceEnd ?? "",
  };
}

const HHMM = /^\d{2}:\d{2}$/;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Rule 16: the first problem with the draft, or null when it can be saved. */
export function blockerDraftError(d: BlockerDraft): BlockerDraftError | null {
  if (!d.date) return "date_required";
  // A cleared <input type="time"> gives "", which would compare as NaN and pass.
  if (!HHMM.test(d.startTime) || !HHMM.test(d.endTime)) return "time_required";
  if (minutes(d.endTime) <= minutes(d.startTime)) return "end_before_start";
  if (d.mode === "recurring" && d.endDate && d.endDate < d.date) return "end_date_before_start_date";
  return null;
}

/** Weekday (JS getDay) of a YYYY-MM-DD date, read as a calendar date. */
function weekdayOf(iso: string): number {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

function plusMonths(iso: string, months: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Rule 16: the request payload for a valid draft. */
export function blockerDraftToInput(d: BlockerDraft): BlockerDraftInput {
  const recurring = d.mode === "recurring";
  const days = d.daysOfWeek.length ? [...d.daysOfWeek] : [weekdayOf(d.date)];
  return {
    title: d.title.trim() || null,
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime,
    isRecurring: recurring,
    recurrenceRule: recurring ? { frequency: "weekly", daysOfWeek: days } : null,
    endDate: recurring ? d.endDate || plusMonths(d.date, 3) : null,
  };
}
