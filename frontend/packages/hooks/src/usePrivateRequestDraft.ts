/**
 * classes.class-requests rule 21: the private class's one draft. Every answer of the three steps and what is derived
 * from them (the roster checks, the free-time read, whether each step is answered) lives here, owned by the shell's
 * wizard, so the foot can read it and web and iOS agree. The logic is the single-form step's, moved: rules 11 to 14a.
 * A draft belongs to one coach: another coach, or `reset()` (the sheet opened again), starts it clean.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FIRST_FREE_DAY_HORIZON_DAYS,
  availabilityReadKey,
  clubTodayISO,
  duplicateInvitees,
  endDateAfterClasses,
  firstFreeDay,
  occurrenceDates,
  slotStarts,
  weeklyIntersection,
  type Window,
} from "@levelup/config";
import type { AvailabilityResponse, ParticipantCheck } from "@levelup/types";
import { requestAvailabilityApi } from "@levelup/api";

export type PrivateStep = "people" | "when" | "time";
export type Recurring = "single" | "weekly";
export type EndMode = "date" | "count";

/** classes.class-requests rule 21: a "Continuar" press sooner than this after a step shows does nothing. */
export const STEP_LOCK_MS = 400;
export const DEFAULT_END_COUNT = 4;
const DEFAULT_END_DAYS = 28;

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

type Draft = {
  people: number;
  usernames: string[];
  checks: Record<string, ParticipantCheck>;
  recurring: Recurring;
  date: string;
  weekdays: number[];
  startDate: string;
  endDate: string;
  endMode: EndMode;
  endCount: number;
  duration: number;
  availability: AvailabilityResponse | null;
  answeredFor: string | null;
  loadingSlots: boolean;
  slot: Window | null;
  note: string;
  sending: boolean;
};

function emptyDraft(): Draft {
  const today = clubTodayISO();
  return {
    people: 1,
    usernames: [],
    checks: {},
    recurring: "single",
    date: today,
    weekdays: [],
    startDate: today,
    endDate: addDaysIso(today, DEFAULT_END_DAYS),
    endMode: "date",
    endCount: DEFAULT_END_COUNT,
    duration: 60,
    availability: null,
    answeredFor: null,
    loadingSlots: false,
    slot: null,
    note: "",
    sending: false,
  };
}

export function usePrivateRequestDraft(coachId: string) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [boundCoach, setBoundCoach] = useState(coachId);
  // Whether the date is the student's own (rule 11): a ref, so the first-free-day read sees it while it is loading.
  const dateOwn = useRef(false);
  const shownAt = useRef<number | null>(null);

  // Another coach is another draft (rule 21): reset during render, so no frame shows the old coach's answers.
  if (boundCoach !== coachId) {
    setBoundCoach(coachId);
    setDraft(emptyDraft());
    dateOwn.current = false;
  }

  const patch = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);
  const today = clubTodayISO();
  const { people, usernames, checks, recurring, date, weekdays, startDate, endDate, endMode, endCount, duration, availability, answeredFor, loadingSlots, slot } = draft;

  const invitees = usernames.slice(0, people - 1).map((u) => u.trim()).filter(Boolean);
  const inviteesKey = invitees.join(",");
  // Rule 12: a name repeated on a later field is refused here, as the server refuses it.
  const repeated = duplicateInvitees(usernames.slice(0, people - 1));
  const allInviteesOk = invitees.length === people - 1 && invitees.every((u) => checks[u]?.ok === true) && !repeated.some(Boolean);

  // Keep one username field per invitee.
  useEffect(() => {
    setDraft((d) => ({ ...d, usernames: Array.from({ length: people - 1 }, (_, i) => d.usernames[i] ?? "") }));
  }, [people]);

  // Rule 12: each username checked against this coach's roster (debounced).
  useEffect(() => {
    // A repeated name is checked once (the server answers its first spelling).
    const pending = invitees.filter((u, i, all) => !checks[u] && all.findIndex((x) => x.toLowerCase() === u.toLowerCase()) === i);
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      requestAvailabilityApi
        .getRequestParticipants(coachId, pending)
        .then((rows) => setDraft((d) => ({ ...d, checks: { ...d.checks, ...Object.fromEntries(rows.map((r) => [r.username, r])) } })))
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, inviteesKey]);

  // "After N classes" (rule 14a) turns the count into the same `endDate` the wire always sent.
  const computedEndDate = endMode === "count" ? endDateAfterClasses(startDate, weekdays, endCount) : null;
  const effectiveEndDate = endMode === "count" ? computedEndDate ?? "" : endDate;
  const recurrence = recurring === "weekly" ? { weekdays: [...weekdays].sort((a, b) => a - b), startDate, endDate: effectiveEndDate } : null;
  const recurrenceValid = !recurrence || (weekdays.length > 0 && startDate <= effectiveEndDate && occurrenceDates(recurrence).length > 0);

  // Rules 11 + 13: for a single class open on the first day that still has free time.
  useEffect(() => {
    if (recurring !== "single" || dateOwn.current || !allInviteesOk) return;
    let active = true;
    requestAvailabilityApi
      .getCoachAvailability({ coachId, from: today, to: addDaysIso(today, FIRST_FREE_DAY_HORIZON_DAYS), participants: invitees })
      .then((res) => {
        // A date the student chose while this was loading wins over the default.
        if (!active || dateOwn.current) return;
        const days = Object.entries(res.freeWindows)
          .filter(([, windows]) => slotStarts(windows, duration).length > 0)
          .map(([d]) => ({ date: d }));
        patch({ date: firstFreeDay(days, today) });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, recurring, inviteesKey, allInviteesOk]);

  // Rule 13: a picked time is for the length it was picked at; a new length starts the pick over.
  useEffect(() => {
    patch({ slot: null });
  }, [duration, patch]);

  // Rule 13: everyone's free windows for the chosen day or recurrence range.
  useEffect(() => {
    patch({ slot: null });
    // A load cancelled by this change never reaches its `finally`, so every early return clears the flag itself.
    if (!allInviteesOk || !recurrenceValid) {
      patch({ availability: null, loadingSlots: false });
      return;
    }
    const from = recurrence ? startDate : date;
    const to = recurrence ? effectiveEndDate : date;
    if (!from || !to) {
      patch({ loadingSlots: false });
      return;
    }
    let active = true;
    patch({ loadingSlots: true });
    requestAvailabilityApi
      .getCoachAvailability({ coachId, from, to, participants: invitees })
      .then((res) => {
        if (!active) return;
        patch({ availability: res, answeredFor: availabilityReadKey({ coachId, from, to, participants: invitees }) });
      })
      .catch(() => active && patch({ availability: null }))
      .finally(() => active && patch({ loadingSlots: false }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, inviteesKey, allInviteesOk, recurring, date, startDate, effectiveEndDate, weekdays.join(","), recurrenceValid]);

  const starts = useMemo(() => {
    if (!availability) return [];
    if (recurrence) return slotStarts(weeklyIntersection(availability.freeWindows, recurrence).windows, duration);
    return slotStarts(availability.freeWindows[date] ?? [], duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, duration, date, recurring, weekdays.join(","), startDate, effectiveEndDate]);

  const slotsState = !allInviteesOk || !recurrenceValid ? "waiting" : loadingSlots ? "loading" : starts.length ? "ready" : "empty";

  // Rule 13b: the read the current answer belongs to; an answer for an earlier choice is not "no free time".
  const answered =
    answeredFor !== null &&
    answeredFor ===
      availabilityReadKey({
        coachId,
        from: recurrence ? startDate : date,
        to: recurrence ? effectiveEndDate : date,
        participants: invitees,
      });

  /** Whether a step's answer lets "Continuar" (or, in `time`, Send) work: rule 21. */
  const stepAnswered = (step: PrivateStep): boolean => {
    if (step === "people") return allInviteesOk;
    if (step === "when") {
      if (recurring === "single") return date !== "" && date >= today;
      return startDate !== "" && recurrenceValid;
    }
    return slot !== null && allInviteesOk;
  };

  return {
    // answers
    people, usernames, recurring, date, weekdays, startDate, endDate, endMode, endCount, duration, slot, note: draft.note, sending: draft.sending,
    setPeople: (n: number) => patch({ people: n }),
    setUsernames: (u: string[] | ((u: string[]) => string[])) => setDraft((d) => ({ ...d, usernames: typeof u === "function" ? u(d.usernames) : u })),
    setRecurring: (r: Recurring) => patch({ recurring: r }),
    /** A date the student picks is their own (rule 11): nothing moves it afterwards. */
    setDate: (v: string) => {
      dateOwn.current = true;
      patch({ date: v });
    },
    setWeekdays: (w: number[]) => patch({ weekdays: w }),
    setStartDate: (v: string) => patch({ startDate: v }),
    setEndDate: (v: string) => patch({ endDate: v }),
    setEndMode: (m: EndMode) => patch({ endMode: m }),
    setEndCount: (n: number) => patch({ endCount: n }),
    setDuration: (n: number) => patch({ duration: n }),
    setSlot: (s: Window | null) => patch({ slot: s }),
    setNote: (v: string) => patch({ note: v }),
    setSending: (v: boolean) => patch({ sending: v }),
    /** "Continuar" in `when` makes its date the student's own (rule 21). */
    confirmDate: () => {
      dateOwn.current = true;
    },
    /** The sheet opened again: an empty draft (rule 21). */
    reset: () => {
      setDraft(emptyDraft());
      dateOwn.current = false;
      shownAt.current = null;
    },
    // derived
    invitees, checks, repeated, allInviteesOk, recurrence, recurrenceValid, effectiveEndDate, availability, loadingSlots, starts, slotsState, answered, today,
    stepAnswered,
    /** The shell calls this from a layout effect when a step shows: the lock is measured from here. */
    markShown: () => {
      shownAt.current = Date.now();
    },
    /** False inside the lock, and before any step has been shown. */
    canAdvance: () => shownAt.current !== null && Date.now() - shownAt.current >= STEP_LOCK_MS,
  };
}
