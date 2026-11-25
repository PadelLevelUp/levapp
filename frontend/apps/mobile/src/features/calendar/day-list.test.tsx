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
import { queryClientDefaultOptions, useDayList } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));
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

function Harness({ initial, onReady }: { initial: Date; onReady?: (api: { select: (d: Date) => void }) => void }) {
  const [selected, setSelected] = useState(initial);
  const list = useDayList({ active: true, selectedDay: selected, selectDay: setSelected });
  onReady?.({ select: setSelected });
  return (
    <>
      <View2 id="selected" value={iso(selected)} />
      <View2 id="target" value={list.target ? iso(list.target) : ""} />
      <DayList
        list={list}
        eventsByDay={list.eventsByDay}
        levelCodeById={new Map()}
        selectedDay={selected}
        onToday={() => list.goTo(new Date(2026, 10, 25))}
      />
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
  let api!: { select: (d: Date) => void };
  await act(async () => {
    root = create(
      <QueryClientProvider client={client}>
        <Harness initial={initial} onReady={(a) => (api = a)} />
      </QueryClientProvider>,
      { createNodeMock: (el) => (el.type === "ScrollView" ? { scrollTo } : null) }
    );
  });
  await flush();
  return { select: (d: Date) => act(async () => api.select(d)) };
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
  getCalendarEvents.mockReset();
  getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
  scrollTo.mockReset();
});
afterEach(() => {
  act(() => root?.unmount());
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
    expect(maybe("calendar-day-section-2026-11-26")).toBeNull();
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
});
