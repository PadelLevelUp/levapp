/**
 * The continuous Dia's list state (calendar.mobile-views rule 26), shared by web and iOS. Platform-neutral: the
 * shells draw the list; this owns what is loaded, what is selected while it scrolls, and when it reads.
 *
 * - What is loaded (26c): opening Dia, or moving to a day outside what is loaded, makes ONE read of whole weeks
 *   (2 before the selected day's week to 4 after it). Within a week of its end it reads the next 4 weeks, once.
 *   Nothing is ever added above. So Dia holds at most two reads; scrolling and selecting inside make none.
 * - The range belongs to Dia: its reads are its own queries, and what shows while the next range answers is the
 *   last Dia range that did (`client.query-cache` rule 5, 26d), never a week another mode read. It is kept while it
 *   contains the selected day, so coming back from Semana or Mês does not centre it again.
 * - A target (26b) is the selected day BEFORE the list moves, and stays so until the shell says it settled. Any
 *   selected day the list did not pick itself through `scrolledTo` is one (a date, a chevron, Hoje, a day picked in
 *   Mês or Semana, a link), and so is the day Dia opens on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import {
  WEEK_STARTS_ON,
  dayListCovers,
  dayListDayAtTop,
  dayListEdges,
  dayListRanges,
  dayListReadParams,
  dayListTailDue,
  type DayListPosition,
  type DayListRange,
} from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { useCalendarEvents } from "./queries";

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Ranges = ReturnType<typeof dayListRanges>;

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export interface UseDayListOptions {
  /** Dia is showing. Off in Semana and Mês: no read is made, and the range is kept. */
  active: boolean;
  /** The one selected day (`useCalendar`'s), which the list follows and moves. */
  selectedDay: Date;
  selectDay: (date: Date) => void;
  weekStartsOn?: WeekStart;
  /** The clock for a movement's one second; passed in so tests own it. */
  now?: () => number;
}

interface Shown {
  span: DayListRange;
  events: CalendarEvent[];
}

export function useDayList({ active, selectedDay, selectDay, weekStartsOn = WEEK_STARTS_ON, now = Date.now }: UseDayListOptions) {
  const [ranges, setRanges] = useState<Ranges | null>(null);
  const [tailRequested, setTailRequested] = useState(false);
  const [target, setTarget] = useState<Date | null>(null);
  const targetSince = useRef(0);
  const selfSelected = useRef<string | null>(null);
  const [wasActive, setWasActive] = useState(false);
  const [seenDay, setSeenDay] = useState(() => iso(selectedDay));

  // 26b: every activation, and every selected day the list did not pick itself, is a target — so the old days'
  // scroll, or a first report at offset 0 before the list has moved, cannot choose another day.
  const selectedIso = iso(selectedDay);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) {
      setTarget(selectedDay);
      targetSince.current = now();
    }
  }
  if (selectedIso !== seenDay) {
    setSeenDay(selectedIso);
    if (active && wasActive && selfSelected.current !== selectedIso && (!target || iso(target) !== selectedIso)) {
      setTarget(selectedDay);
      targetSince.current = now();
    }
    selfSelected.current = null;
  }

  // The range is kept while it holds the selected day (with the tail, once it is asked for); otherwise Dia
  // opens a new one around the selected day. Derived while rendering so the very first read is for the right weeks.
  if (active) {
    const covered = ranges
      ? { start: ranges.first.start, end: tailRequested ? ranges.tail.end : ranges.first.end }
      : null;
    if (!ranges || !covered || !dayListCovers(covered, selectedDay)) {
      setRanges(dayListRanges(selectedDay, weekStartsOn));
      setTailRequested(false);
    }
  }

  const firstParams = ranges ? dayListReadParams(ranges.first) : { from: "", to: "" };
  const tailParams = ranges ? dayListReadParams(ranges.tail) : { from: "", to: "" };

  const first = useCalendarEvents(firstParams.from, firstParams.to, {
    enabled: active && ranges !== null,
  });
  const tail = useCalendarEvents(tailParams.from, tailParams.to, {
    enabled: active && ranges !== null && tailRequested,
  });

  const firstReady = first.data !== undefined;
  const tailReady = tail.data !== undefined;

  // The days on screen: the current range once it answers; until then (a jump, a retry) the last one that did.
  const lastShown = useRef<Shown | null>(null);
  const shown = useMemo<Shown | null>(() => {
    if (!active || !ranges) return lastShown.current;
    if (firstReady && first.data) {
      const withTail = tailRequested && tailReady && tail.data;
      return {
        span: { start: ranges.first.start, end: withTail ? ranges.tail.end : ranges.first.end },
        events: withTail ? [...first.data, ...(tail.data as CalendarEvent[])] : first.data,
      };
    }
    return lastShown.current;
  }, [active, ranges, firstReady, first.data, tailRequested, tailReady, tail.data]);
  lastShown.current = shown;

  // The second read, once, within a week of the end of the first.
  useEffect(() => {
    if (active && ranges && firstReady && !tailRequested && dayListTailDue(selectedDay, ranges)) {
      setTailRequested(true);
    }
  }, [active, ranges, firstReady, tailRequested, selectedDay]);

  const days = useMemo(() => {
    if (!shown) return [] as Date[];
    const out: Date[] = [];
    for (let d = shown.span.start; d.getTime() <= shown.span.end.getTime(); d = addDays(d, 1)) out.push(d);
    return out;
  }, [shown]);

  const eventsByDay = useMemo(() => {
    const byDay: Record<string, CalendarEvent[]> = {};
    for (const e of shown?.events ?? []) (byDay[e.date] ??= []).push(e);
    for (const list of Object.values(byDay)) list.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
    return byDay;
  }, [shown]);

  const status: "idle" | "loading" | "ready" | "error" =
    !active || !ranges ? "idle" : firstReady ? "ready" : first.isError ? "error" : "loading";
  const tailStatus: "idle" | "loading" | "ready" | "error" = !tailRequested
    ? "idle"
    : tailReady
      ? "ready"
      : tail.isError
        ? "error"
        : "loading";

  // 26b: the target holds until its section is on screen AND the shell says the movement settled.
  const targetLoaded = target !== null && days.some((d) => iso(d) === iso(target));
  const jumping = target !== null && !targetLoaded;
  // The second's clock starts when the section is there to move to, not when the jump began: a read slower than a
  // second must not hand the list back to its own scroll (rule 26b).
  const stampedFor = useRef<string | null>(null);
  const targetIso = target ? iso(target) : null;
  useEffect(() => {
    if (!targetIso) {
      stampedFor.current = null;
      return;
    }
    if (targetLoaded && stampedFor.current !== targetIso) {
      stampedFor.current = targetIso;
      targetSince.current = now();
    }
  }, [targetIso, targetLoaded, now]);

  const goTo = useCallback(
    (date: Date) => {
      targetSince.current = now();
      setTarget(date);
      selectDay(date);
    },
    [selectDay, now]
  );

  const settled = useCallback(() => setTarget(null), []);

  /** The shell reports where its list is; the selected day follows, unless a target is in progress (26a, 26b). */
  const scrolledTo = useCallback(
    (input: { days: readonly DayListPosition[]; offset: number; touched?: boolean }) => {
      const top = dayListDayAtTop({
        days: input.days,
        offset: input.offset,
        target: target ? iso(target) : null,
        touched: input.touched,
        elapsedMs: now() - targetSince.current,
      });
      if (!top) return;
      if (target && top !== iso(target)) setTarget(null); // a touch or the second's end: the list's own scroll rules
      if (top !== iso(selectedDay)) {
        selfSelected.current = top;
        selectDay(parseISO(top));
      }
    },
    [target, selectedDay, selectDay, now]
  );

  const retry = useCallback(() => void first.refetch(), [first]);
  const retryTail = useCallback(() => void tail.refetch(), [tail]);
  /** The pull to refresh: both reads that are on (client.pull-to-refresh, "the shown range"). */
  const refetchAll = useCallback(async () => {
    await Promise.all([first.refetch(), ...(tailRequested ? [tail.refetch()] : [])]);
  }, [first, tail, tailRequested]);

  return {
    status,
    tail: tailStatus,
    events: shown?.events ?? [],
    eventsByDay,
    days,
    range: shown?.span ?? null,
    edges: shown ? dayListEdges(shown.span, weekStartsOn) : null,
    target,
    jumping,
    goTo,
    settled,
    scrolledTo,
    retry,
    retryTail,
    refetchAll,
  };
}
