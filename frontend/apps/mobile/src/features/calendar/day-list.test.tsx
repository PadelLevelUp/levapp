/**
 * calendar.mobile-views rule 26 (iOS): Dia's one list of days. The list is a ScrollView with measured offsets, so
 * the test plays the native side: it fires the `onLayout` / `onContentSizeChange` / `onScroll` events the device
 * would, and reads what the list asked the ScrollView to do (`scrollTo`). Counts are counts of calls to the calendar
 * API mock; `t` returns the key.
 *
 * What this cannot show: that the device sends its layout events before the next frame (a wrong frame is the
 * simulator's to catch), and how a real card's text size changes the offsets.
 */
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pinned (the file reads "today" through Hoje): 25 Nov 2026, midday. Only Date is faked, so timers stay real.
const PINNED_NOW = new Date(2026, 10, 25, 12, 0, 0);
import { queryClientDefaultOptions, useDayList } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
// Reduced motion (rule 26b) is read once and followed: the test owns both the answer and the subscription.
const reduceMotion = vi.hoisted(() => ({ on: false, listener: null as null | ((on: boolean) => void), removed: 0 }));
vi.mock("react-native", async (orig) => ({
  ...(await orig<object>()),
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => reduceMotion.on,
    addEventListener: (_event: string, cb: (on: boolean) => void) => {
      reduceMotion.listener = cb;
      return { remove: () => void (reduceMotion.removed += 1) };
    },
    announceForAccessibility: () => undefined,
  },
}));
const getCalendarEvents = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/calendar", () => ({
  getCalendarEvents: (from: string, to: string) => getCalendarEvents(from, to),
}));
vi.mock("./EventCard", async () => {
  const { createElement: h } = await import("react");
  return { EventCard: ({ event }: { event: { id: string } }) => h("View", { testID: "calendar-event-card", eventId: event.id }) };
});

import { DayList } from "./DayList";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** One class on Wednesday 25 Nov 2026 only: every other day is empty. */
const WEDNESDAY_CLASS = {
  id: "class-1",
  type: "class",
  date: "2026-11-25",
  startTime: "18:00",
  endTime: "19:00",
  title: "Wednesday class",
  model: "Lesson",
  originalId: 1,
  isRecurring: false,
  status: "scheduled",
} as CalendarEvent;
const eventsFor = (from: string, to: string) =>
  WEDNESDAY_CLASS.date >= from.slice(0, 10) && WEDNESDAY_CLASS.date <= to.slice(0, 10) ? [WEDNESDAY_CLASS] : [];

const HEADER_H = 70;
const CARD_H = 100;
const EDGE_H = 44;

let root: ReactTestRenderer;
const scrollTo = vi.fn();

type Api = { select: (d: Date) => void; setActive: (on: boolean) => void };
function Harness({ initial, onReady }: { initial: Date; onReady?: (api: Api) => void }) {
  const [selected, setSelected] = useState(initial);
  const [active, setActive] = useState(true);
  const list = useDayList({ active, selectedDay: selected, selectDay: setSelected });
  onReady?.({ select: setSelected, setActive });
  return (
    <>
      <View2 id="selected" value={iso(selected)} />
      <View2 id="target" value={list.target ? iso(list.target) : ""} />
      {active && <DayList
        list={list}
        eventsByDay={list.eventsByDay}
        levelCodeById={new Map()}
        selectedDay={selected}
        onToday={() => list.goTo(new Date(2026, 10, 25))}
      />}
    </>
  );
}
/** A host element carrying a value the test reads back. */
function View2({ id, value }: { id: string; value: string }) {
  return createElement("Probe", { testID: `probe-${id}`, value });
}

async function mount(initial = new Date(2026, 10, 25)) {
  const client = new QueryClient({
    defaultOptions: { queries: { ...queryClientDefaultOptions.queries, retry: false } },
  });
  let api!: Api;
  await act(async () => {
    root = create(
      <QueryClientProvider client={client}>
        <Harness initial={initial} onReady={(a) => (api = a)} />
      </QueryClientProvider>,
      { createNodeMock: (el) => (el.type === "ScrollView" ? { scrollTo } : null) }
    );
  });
  await flush();
  return {
    select: (d: Date) => act(async () => api.select(d)),
    setActive: (on: boolean) => act(async () => api.setActive(on)),
  };
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const all = (re: RegExp): ReactTestInstance[] =>
  root.root.findAll((n) => typeof n.type === "string" && re.test(String(n.props.testID ?? "")));
const one = (id: string) => {
  const hit = all(new RegExp(`^${id}$`))[0];
  if (!hit) throw new Error(`no element with testID "${id}"`);
  return hit;
};
const maybe = (id: string) => all(new RegExp(`^${id}$`))[0] ?? null;
const probe = (id: string) => one(`probe-${id}`).props.value as string;
const headers = () => all(/^calendar-day-header-\d{4}-\d{2}-\d{2}$/);
const list = () => one("calendar-day-list");
const press = (id: string) => act(async () => { one(id).props.onPress(); });

/** The device's layout pass: every header gets its y (events stack under their day), then the content size. */
async function layoutAll(shift = 0) {
  let y = EDGE_H + shift;
  await act(async () => {
    for (const h of headers()) {
      const day = String(h.props.testID).slice("calendar-day-header-".length);
      h.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 390, height: HEADER_H } } });
      y += HEADER_H + (day === WEDNESDAY_CLASS.date ? CARD_H : 0);
    }
    list().props.onContentSizeChange(390, y + 600);
  });
}
const offsetOf = (day: string) => {
  let y = EDGE_H;
  for (const h of headers()) {
    const d = String(h.props.testID).slice("calendar-day-header-".length);
    if (d === day) return y;
    y += HEADER_H + (d === WEDNESDAY_CLASS.date ? CARD_H : 0);
  }
  throw new Error(`no header for ${day}`);
};
const scrollEvent = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } });
const scrollBy = (y: number) => act(async () => { list().props.onScroll(scrollEvent(y)); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  reduceMotion.on = false;
  reduceMotion.listener = null;
  reduceMotion.removed = 0;
  getCalendarEvents.mockReset();
  getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
  scrollTo.mockReset();
});
afterEach(() => {
  act(() => root?.unmount());
  vi.useRealTimers();
});

describe("Dia on iOS: one list of days (rule 26)", () => {
  it("[CALENDAR-MOBILE-VIEWS-43] a failed second read offers a retry", async () => {
    getCalendarEvents.mockImplementation(async (from: string, to: string) => {
      if (from.startsWith("2026-12-27")) throw new Error("offline");
      return eventsFor(from, to);
    });
    const { select } = await mount();
    expect(headers()).toHaveLength(49);
    expect(maybe("calendar-day-edge-after")).not.toBeNull();

    // Within a week of the end the second read starts, and fails.
    await select(new Date(2026, 11, 22));
    await flush();
    expect(all(/^calendar-day-tail-error$/)).toHaveLength(1);
    expect(headers()).toHaveLength(49);
    expect(maybe("calendar-day-edge-after")).toBeNull();

    // The retry adds the weeks.
    getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
    await press("calendar-day-tail-retry");
    await flush();
    expect(headers()).toHaveLength(77);
    expect(maybe("calendar-day-tail-error")).toBeNull();
    expect(maybe("calendar-day-edge-after")).not.toBeNull();
  });

  it("[CALENDAR-MOBILE-VIEWS-37] opening, laying out and scrolling through every loaded day makes at most the two reads", async () => {
    await mount();
    expect(getCalendarEvents).toHaveBeenCalledTimes(1);
    await layoutAll();
    for (let y = 0; y < 49 * HEADER_H; y += 90) await scrollBy(y);
    await layoutAll(5); // a relayout (text size changed): offsets move, still no read
    await scrollBy(0);
    await flush();
    // The first read, and the next four weeks once the end was reached: nothing else, however far it went.
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
    await scrollBy(offsetOf("2026-11-25"));
    await layoutAll();
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
  });

  it("[CALENDAR-MOBILE-VIEWS-42] each day has a sticky header with its date; an empty day says so once, a full one has its cards", async () => {
    await mount();
    expect(headers()).toHaveLength(49);
    const children = list().props.children.flat(Infinity).filter(Boolean);
    const sticky: number[] = list().props.stickyHeaderIndices;
    expect(sticky).toHaveLength(49);
    for (const i of sticky) expect(String(children[i].props.testID)).toMatch(/^calendar-day-header-/);
    expect(all(/^calendar-day-empty$/)).toHaveLength(48);
    expect(one("calendar-day-section-2026-11-25")).toBeTruthy();
    expect(all(/^calendar-event-card$/)).toHaveLength(1);
    // Every day has its section (26g, VIEWS-42), the empty ones too, so one assertion reads any day.
    expect(all(/^calendar-day-section-\d{4}-\d{2}-\d{2}$/)).toHaveLength(49);
    expect(maybe("calendar-day-section-2026-11-26")).not.toBeNull();
  });

  it("[CALENDAR-MOBILE-VIEWS-42] stays hidden until it has scrolled to the opening day, then stands there without animation", async () => {
    await mount();
    expect(list().props.style.opacity).toBe(0);
    await layoutAll();
    expect(scrollTo).toHaveBeenCalledWith({ y: offsetOf("2026-11-25"), animated: false });
    expect(list().props.style.opacity).toBe(1);
    expect(probe("target")).toBe("");
  });

  it("[CALENDAR-MOBILE-VIEWS-38] scrolling selects the day at the top; a day inside the range moves smoothly to its date", async () => {
    const { select } = await mount();
    await layoutAll();
    scrollTo.mockClear();
    await scrollBy(offsetOf("2026-11-27") + 3);
    expect(probe("selected")).toBe("2026-11-27");
    expect(getCalendarEvents).toHaveBeenCalledTimes(1);

    // A date picked in the strip is a target: selected at once, then the list moves to it.
    await select(new Date(2026, 11, 1));
    await layoutAll();
    expect(probe("selected")).toBe("2026-12-01");
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2026-12-01"), animated: true });
    // Its own movement reports days on the way; the target holds.
    await scrollBy(offsetOf("2026-11-29"));
    expect(probe("selected")).toBe("2026-12-01");
    // A touch ends the movement at once and the day at the top rules.
    await act(async () => { list().props.onScrollBeginDrag(); });
    await scrollBy(offsetOf("2026-11-30") + 2);
    expect(probe("selected")).toBe("2026-11-30");
  });

  it("[CALENDAR-MOBILE-VIEWS-38] the end of a movement hands the list back at the target", async () => {
    const { select } = await mount();
    await layoutAll();
    await select(new Date(2026, 11, 1));
    await layoutAll();
    expect(probe("target")).toBe("2026-12-01");
    await act(async () => { list().props.onMomentumScrollEnd(scrollEvent(offsetOf("2026-12-01"))); });
    expect(probe("target")).toBe("");
    await scrollBy(offsetOf("2026-12-01") + 1);
    expect(probe("selected")).toBe("2026-12-01");
  });

  it("[CALENDAR-MOBILE-VIEWS-42] prepending days keeps the day at the top where it is", async () => {
    await mount();
    await layoutAll();
    // The reader stands 30pt into 27 Nov.
    await scrollBy(offsetOf("2026-11-27") + 30);
    scrollTo.mockClear();
    // Days land above (their headers push everything down by 700): the device relays out every header.
    await layoutAll(700);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2026-11-27") + 700 + 30, animated: false });
  });

  it("[CALENDAR-MOBILE-VIEWS-42] Hoje shows when the selected day is not today and moves to it; at today it is gone", async () => {
    const { select } = await mount();
    expect(maybe("calendar-day-today")).toBeNull();
    await select(new Date(2026, 11, 3));
    expect(maybe("calendar-day-today")).not.toBeNull();
    await press("calendar-day-today");
    expect(probe("target")).toBe("2026-11-25");
    expect(probe("selected")).toBe("2026-11-25");
    expect(maybe("calendar-day-today")).toBeNull();
  });

  it("[CALENDAR-MOBILE-VIEWS-42] the edge rows reopen the list on the week just outside, at its first day", async () => {
    await mount();
    await press("calendar-day-edge-after");
    expect(probe("target")).toBe(iso(addDays(new Date(2026, 11, 26), 1)));
    await flush();
    expect(getCalendarEvents).toHaveBeenCalledTimes(2);
  });

  it("[CALENDAR-MOBILE-VIEWS-46] a failed jump outside the range says so, with the earlier days still below", async () => {
    const { select } = await mount();
    getCalendarEvents.mockImplementation(async () => {
      throw new Error("offline");
    });
    await select(new Date(2027, 5, 1));
    await flush();
    expect(maybe("calendar-day-error")).not.toBeNull();
    expect(headers()).toHaveLength(49);
    expect(probe("selected")).toBe("2027-06-01");
    getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
    await press("calendar-day-retry");
    await flush();
    expect(maybe("calendar-day-error")).toBeNull();
    expect(one("calendar-day-header-2027-06-01")).toBeTruthy();
  });

  it("[CALENDAR-MOBILE-VIEWS-42] the list ends with filler, never shorter than the add buttons' clearance", async () => {
    await mount();
    expect(one("calendar-day-filler").props.style.height).toBeGreaterThanOrEqual(168);
  });

  it("[CALENDAR-MOBILE-VIEWS-42] Dia -> Mês -> a day outside the range -> offline -> Dia: the list and its error row are visible", async () => {
    const { select, setActive } = await mount();
    await layoutAll();
    await setActive(false);
    await select(new Date(2027, 5, 1));
    getCalendarEvents.mockImplementation(async () => {
      throw new Error("offline");
    });
    await setActive(true);
    await flush();
    // The list came back unplaced with Dia's own earlier days and a failed read: neither may be hidden.
    expect(one("calendar-day-list").props.style.opacity).toBe(1);
    expect(maybe("calendar-day-error")).not.toBeNull();
    expect(maybe("calendar-day-retry")).not.toBeNull();
  });

  it("[CALENDAR-MOBILE-VIEWS-42] Dia -> Mês -> a day outside the range -> a slow read -> Dia shows skeleton rows, not a blank list", async () => {
    const { select, setActive } = await mount();
    await layoutAll();
    await setActive(false);
    await select(new Date(2027, 5, 1));
    getCalendarEvents.mockImplementation(() => new Promise(() => undefined));
    await setActive(true);
    await flush();
    expect(maybe("calendar-day-loading")).not.toBeNull();
  });

  it("[CALENDAR-MOBILE-VIEWS-42] a list whose headers never lay out is shown anyway after a moment", async () => {
    await mount();
    expect(list().props.style.opacity).toBe(0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1700));
    });
    expect(list().props.style.opacity).toBe(1);
  });

  it("[CALENDAR-MOBILE-VIEWS-38] a touch during a movement ends the target, and a later render does not pull the reader back", async () => {
    const { select } = await mount();
    await layoutAll();
    await select(new Date(2026, 11, 1));
    await layoutAll();
    expect(probe("target")).toBe("2026-12-01");
    // The movement has got into the target's own day when the reader puts a finger on the list.
    await scrollBy(offsetOf("2026-12-01") + 10);
    await act(async () => { list().props.onScrollBeginDrag(); });
    expect(probe("target")).toBe("");
    scrollTo.mockClear();
    await scrollBy(offsetOf("2026-12-01") + 40);
    await layoutAll();
    await flush();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("[CALENDAR-MOBILE-VIEWS-38] a second target during a movement is moved to, and its arrival ends it", async () => {
    const { select } = await mount();
    await layoutAll();
    await select(new Date(2026, 11, 1));
    await layoutAll();
    scrollTo.mockClear();
    await select(new Date(2026, 11, 3));
    await layoutAll();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2026-12-03"), animated: true });
    await act(async () => { list().props.onMomentumScrollEnd(scrollEvent(offsetOf("2026-12-03"))); });
    expect(probe("target")).toBe("");
    expect(probe("selected")).toBe("2026-12-03");
  });

  it("[CALENDAR-MOBILE-VIEWS-38] offsets measured for an earlier range are not used for the new one", async () => {
    const { select } = await mount();
    await layoutAll();
    // 27 Dec is the first day outside the loaded weeks: the range is replaced, its days re-measure.
    await select(new Date(2026, 11, 27));
    await flush();
    await act(async () => {
      one("calendar-day-header-2026-12-27").props.onLayout({ nativeEvent: { layout: { x: 0, y: 100, width: 390, height: HEADER_H } } });
      list().props.onContentSizeChange(390, 5000);
    });
    await act(async () => { list().props.onScrollBeginDrag(); });
    // Only the header that has laid out for the new range counts: the retained days' old offsets do not.
    await scrollBy(300);
    expect(probe("selected")).toBe("2026-12-27");
  });

  it("[CALENDAR-MOBILE-VIEWS-46] the old days scrolling while a read for another range is slow select nothing", async () => {
    const { select } = await mount();
    await layoutAll();
    let release!: () => void;
    getCalendarEvents.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve([]); })
    );
    await select(new Date(2027, 5, 1));
    await scrollBy(offsetOf("2026-11-27"));
    await scrollBy(offsetOf("2026-12-03"));
    expect(probe("selected")).toBe("2027-06-01");
    expect(probe("target")).toBe("2027-06-01");
    await act(async () => { release(); });
    await flush();
    expect(one("calendar-day-header-2027-06-01")).toBeTruthy();
    await layoutAll();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2027-06-01"), animated: false });
    expect(probe("selected")).toBe("2027-06-01");
  });

  it("[CALENDAR-MOBILE-VIEWS-42] the filler is the viewport minus the last day's header, body and the bottom block", async () => {
    await mount();
    await layoutAll();
    const last = headers()[headers().length - 1];
    const lastDay = String(last.props.testID).slice("calendar-day-header-".length);
    await act(async () => {
      list().props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
      last.props.onLayout({ nativeEvent: { layout: { x: 0, y: 9000, width: 390, height: 70 } } });
      one(`calendar-day-section-${lastDay}`).props.onLayout({ nativeEvent: { layout: { x: 0, y: 9070, width: 390, height: 9 } } });
      one("calendar-day-bottom").props.onLayout({ nativeEvent: { layout: { x: 0, y: 9079, width: 390, height: 44 } } });
    });
    expect(one("calendar-day-filler").props.style.height).toBe(844 - 70 - 9 - 44);
  });

  it("[CALENDAR-MOBILE-VIEWS-42] Hoje, the edge rows and the retry grow with the text size: a minimum height, never a fixed one", async () => {
    const { select } = await mount();
    await select(new Date(2026, 11, 3));
    for (const id of ["calendar-day-today", "calendar-day-edge-before", "calendar-day-edge-after"]) {
      const cls = String(one(id).props.className);
      expect(cls, id).toMatch(/(^|\s)min-h-11(\s|$)/);
      expect(cls, id).not.toMatch(/(^|\s)h-11(\s|$)/);
    }
  });

  it("[CALENDAR-MOBILE-VIEWS-48] reduced motion is followed while the list is mounted: a tapped date jumps, and the subscription ends with the list", async () => {
    const { select } = await mount();
    await layoutAll();
    expect(reduceMotion.listener).not.toBeNull();
    await act(async () => { reduceMotion.listener!(true); });
    scrollTo.mockClear();
    await select(new Date(2026, 11, 1));
    await layoutAll();
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2026-12-01"), animated: false });
    act(() => root.unmount());
    expect(reduceMotion.removed).toBe(1);
  });

  it("[CALENDAR-MOBILE-VIEWS-42] a tapped date moves the list after a re-render that sent no content-size event (the device sends one only when the size changes)", async () => {
    const { select } = await mount();
    await layoutAll();
    scrollTo.mockClear();
    // The strip's tap: the day is selected, the screen re-renders, nothing in the content changed, so the device
    // fires no onContentSizeChange and no onLayout. The list must still go there (CI Android: it did not).
    await select(new Date(2026, 11, 1));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2026-12-01"), animated: true });
  });

  it("[CALENDAR-MOBILE-VIEWS-42] arrival does not depend on the animation: if the list is not at the day when the movement ends, it is put there without animation", async () => {
    const { select } = await mount();
    await layoutAll();
    await select(new Date(2026, 11, 1));
    scrollTo.mockClear();
    // The animated scroll never moved (no onScroll, no momentum end): the second's limit ends the movement.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100));
    });
    expect(probe("target")).toBe("");
    expect(scrollTo).toHaveBeenLastCalledWith({ y: offsetOf("2026-12-01"), animated: false });

    // Where it did arrive, nothing is corrected.
    await select(new Date(2026, 11, 3));
    scrollTo.mockClear();
    await scrollBy(offsetOf("2026-12-03"));
    await act(async () => { list().props.onMomentumScrollEnd(scrollEvent(offsetOf("2026-12-03"))); });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
