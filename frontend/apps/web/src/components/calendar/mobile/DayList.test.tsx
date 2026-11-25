/**
 * calendar.mobile-views rule 26 (web phone): Dia's one list of days. Counts are counts of calls to the calendar
 * API mock; `t` returns the key, so the words checked are the keys the screen uses.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { queryClientDefaultOptions, useDayList } from "@levelup/hooks";
import type { CalendarEvent } from "@levelup/types";

vi.mock("react-i18next", async (orig) => ({
  ...(await orig<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
const getCalendarEvents = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api/src/resources/calendar", () => ({
  getCalendarEvents: (from: string, to: string) => getCalendarEvents(from, to),
}));

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

/** The page around the list, as the screen builds it: one selected day, the hook, the list. */
function Harness({ initial, onReady }: { initial: Date; onReady?: (api: { select: (d: Date) => void }) => void }) {
  const [selected, setSelected] = useState(initial);
  const list = useDayList({ active: true, selectedDay: selected, selectDay: setSelected });
  onReady?.({ select: setSelected });
  return (
    <>
      <span data-testid="selected">{iso(selected)}</span>
      <span data-testid="target">{list.target ? iso(list.target) : ""}</span>
      <DayList list={list} eventsByDay={list.eventsByDay} levelCodeById={new Map()} />
    </>
  );
}

function mount(initial = new Date(2026, 10, 25)) {
  const client = new QueryClient({
    defaultOptions: { queries: { ...queryClientDefaultOptions.queries, retry: false } },
  });
  let api!: { select: (d: Date) => void };
  const view = render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} onReady={(a) => (api = a)} />
    </QueryClientProvider>
  );
  return { ...view, select: (d: Date) => act(async () => api.select(d)) };
}

const sections = () => document.querySelectorAll("[data-testid^='calendar-day-section-']");

beforeEach(() => {
  getCalendarEvents.mockReset();
  getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { onscrollend?: unknown }).onscrollend;
});

describe("Dia's list of days on web (rule 26)", () => {
  it("[CALENDAR-MOBILE-VIEWS-43] a failed second read offers a retry", async () => {
    getCalendarEvents.mockImplementation(async (from: string, to: string) => {
      if (from.startsWith("2026-12-27")) throw new Error("offline");
      return eventsFor(from, to);
    });
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await screen.findByTestId("calendar-day-edge-after");

    // Within a week of the end the second read starts, and fails.
    await select(new Date(2026, 11, 22));
    await screen.findByTestId("calendar-day-tail-error");
    // One line with a retry at the end; the days stay; no edge row below the failure.
    expect(screen.getAllByTestId("calendar-day-tail-error")).toHaveLength(1);
    expect(screen.getByTestId("calendar-day-tail-error")).toHaveTextContent("calendar.mobile.loadMoreFailed");
    expect(sections()).toHaveLength(49);
    expect(screen.queryByTestId("calendar-day-edge-after")).toBeNull();

    // The retry adds the weeks.
    getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
    fireEvent.click(screen.getByTestId("calendar-day-tail-retry"));
    await waitFor(() => expect(sections()).toHaveLength(77));
    expect(screen.queryByTestId("calendar-day-tail-error")).toBeNull();
    expect(screen.getByTestId("calendar-day-edge-after")).toBeInTheDocument();
  });

  it("[CALENDAR-MOBILE-VIEWS-41] each day has its header; an empty day is the header and one line", async () => {
    mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    const full = screen.getByTestId("calendar-day-section-2026-11-25");
    expect(within(full).getByTestId("calendar-day-header-2026-11-25").className).toContain("sticky");
    expect(within(full).getAllByTestId("calendar-event-card")).toHaveLength(1);
    expect(within(full).queryByTestId("calendar-day-empty")).toBeNull();

    const empty = screen.getByTestId("calendar-day-section-2026-11-26");
    expect(within(empty).getByRole("heading", { level: 3 })).toBeInTheDocument();
    expect(within(empty).getByTestId("calendar-day-empty")).toHaveTextContent("calendar.mobile.noClassesScheduled");
    expect(within(empty).queryByTestId("calendar-event-card")).toBeNull();
  });

  it("[CALENDAR-MOBILE-VIEWS-41] the list ends with filler, never shorter than the add buttons' clearance", async () => {
    mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    const filler = screen.getByTestId("calendar-day-filler");
    expect(parseInt(filler.style.height, 10)).toBeGreaterThanOrEqual(224);
  });

  it("[CALENDAR-MOBILE-VIEWS-40] the first positioning jumps to the selected day and ends the target", async () => {
    mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    const calls = (Element.prototype.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.at(-1)?.[0]).toMatchObject({ behavior: "auto" });
  });

  it("[CALENDAR-MOBILE-VIEWS-40] a date inside the loaded range moves smoothly and settles when the list has been still (no scrollend)", async () => {
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    const scrollTo = Element.prototype.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    vi.useFakeTimers();
    await select(new Date(2026, 11, 3));
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-03");
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
    // Still moving: scroll events keep the target in place.
    const list = screen.getByTestId("calendar-day-list");
    await act(async () => {
      vi.advanceTimersByTime(80);
      list.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(80);
      list.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-03");
    // Still for a moment: settled.
    await act(async () => {
      vi.advanceTimersByTime(130);
    });
    expect(screen.getByTestId("target")).toHaveTextContent("");
    expect(screen.getByTestId("selected")).toHaveTextContent("2026-12-03");
  });

  it("[CALENDAR-MOBILE-VIEWS-40] a movement that never goes still ends after one second (no scrollend)", async () => {
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));

    vi.useFakeTimers();
    await select(new Date(2026, 11, 3));
    const list = screen.getByTestId("calendar-day-list");
    // A scroll event every 100ms: never still for the 120ms the quiet path needs.
    for (let t = 0; t < 900; t += 100) {
      await act(async () => {
        vi.advanceTimersByTime(100);
        list.dispatchEvent(new Event("scroll"));
      });
    }
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-03");
    await act(async () => {
      vi.advanceTimersByTime(100);
      list.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByTestId("target")).toHaveTextContent("");
  });

  it("[CALENDAR-MOBILE-VIEWS-40] where the browser has scrollend, that ends the movement", async () => {
    Object.defineProperty(HTMLElement.prototype, "onscrollend", { value: null, configurable: true, writable: true });
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));

    await select(new Date(2026, 11, 3));
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-03");
    // Scroll events alone do not end it.
    await act(async () => {
      screen.getByTestId("calendar-day-list").dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-03");
    await act(async () => {
      screen.getByTestId("calendar-day-list").dispatchEvent(new Event("scrollend"));
    });
    expect(screen.getByTestId("target")).toHaveTextContent("");
  });

  it("[CALENDAR-MOBILE-VIEWS-48] with reduced motion the list jumps to the day", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    const scrollTo = Element.prototype.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();

    await select(new Date(2026, 11, 3));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
    expect(scrollTo).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
    expect(screen.getByTestId("target")).toHaveTextContent("");
  });

  it("[CALENDAR-MOBILE-VIEWS-48] the edge rows reopen the list on the week just outside, at its first day", async () => {
    mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    getCalendarEvents.mockClear();

    fireEvent.click(screen.getByTestId("calendar-day-edge-before"));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("2026-11-01"));
    await waitFor(() => expect(getCalendarEvents).toHaveBeenCalledTimes(1));
    expect(getCalendarEvents).toHaveBeenCalledWith("2026-10-18T00:00:00", "2026-12-05T23:59:59");
    await waitFor(() => expect(screen.getByTestId("calendar-day-section-2026-10-18")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("calendar-day-edge-after"));
    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("2026-12-06"));
  });

  it("[CALENDAR-MOBILE-VIEWS-39] scrolling selects the day at the top and makes no request", async () => {
    mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    getCalendarEvents.mockClear();

    // jsdom has no layout: give each section a top, 100px apart, and the list a scroll offset.
    const list = screen.getByTestId("calendar-day-list");
    document.querySelectorAll("[data-testid^='calendar-day-section-']").forEach((el, i) => {
      Object.defineProperty(el, "offsetTop", { value: i * 100, configurable: true });
    });
    const days = [...document.querySelectorAll("[data-testid^='calendar-day-section-']")].map((el) =>
      (el.getAttribute("data-testid") as string).replace("calendar-day-section-", "")
    );
    await act(async () => {
      list.scrollTop = 1250;
      list.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByTestId("selected")).toHaveTextContent(days[12]);
    expect(parseISO(days[12]).getTime()).toBe(addDays(parseISO(days[0]), 12).getTime());
    expect(getCalendarEvents).not.toHaveBeenCalled();
  });

  it("[CALENDAR-MOBILE-VIEWS-40] the end of a movement does not put the list back where it was", async () => {
    Element.prototype.scrollTo = function (this: Element, opts?: ScrollToOptions | number) {
      (this as HTMLElement).scrollTop = typeof opts === "object" ? (opts.top ?? 0) : 0;
    } as unknown as typeof Element.prototype.scrollTo;
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    const list = screen.getByTestId("calendar-day-list");
    // jsdom has no layout: every section gets a top, 100px apart.
    const keys = [...sections()].map((el) => (el.getAttribute("data-testid") as string).replace("calendar-day-section-", ""));
    sections().forEach((el, i) => Object.defineProperty(el, "offsetTop", { value: i * 100, configurable: true }));
    // The reader is at the sixth day.
    await act(async () => {
      list.scrollTop = 500;
      list.dispatchEvent(new Event("scroll"));
    });
    // A date moves the list to the eleventh; when the movement ends the list stays there.
    await select(parseISO(keys[10]));
    expect(list.scrollTop).toBe(1000);
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    expect(list.scrollTop).toBe(1000);
    expect(screen.getByTestId("selected")).toHaveTextContent(keys[10]);
  });

  it("[CALENDAR-MOBILE-VIEWS-46] a failed jump outside the range says so at the top, with the earlier days still below", async () => {
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    // The read for a day far outside the range fails.
    getCalendarEvents.mockImplementation(async (from: string, to: string) => {
      if (from.startsWith("2027-02")) throw new Error("offline");
      return eventsFor(from, to);
    });
    await select(new Date(2027, 2, 10));
    const error = await screen.findByTestId("calendar-day-error");
    expect(error).toHaveTextContent("calendar.mobile.loadFailed");
    expect(sections()).toHaveLength(49); // the earlier days stay
    // The error is the first thing in the list.
    const list = screen.getByTestId("calendar-day-list");
    expect(list.firstElementChild).toBe(error);

    getCalendarEvents.mockImplementation(async (from: string, to: string) => eventsFor(from, to));
    fireEvent.click(screen.getByTestId("calendar-day-retry"));
    await waitFor(() => expect(screen.queryByTestId("calendar-day-error")).toBeNull());
    await waitFor(() => expect(screen.getByTestId("calendar-day-section-2027-03-10")).toBeInTheDocument());
  });

  it("[CALENDAR-MOBILE-VIEWS-41] an empty day says it once: the header's own line is the empty line", async () => {
    mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    const empty = screen.getByTestId("calendar-day-section-2026-11-26");
    expect(within(empty).getAllByTestId("calendar-day-empty")).toHaveLength(1);
    expect(within(empty).getByTestId("calendar-day-empty")).toHaveTextContent("calendar.mobile.noClassesScheduled");
    // The header does not also count its classes ("0 classes").
    expect(empty).not.toHaveTextContent("calendar.mobile.classCount");
    expect(within(empty).getByTestId("calendar-day-header-2026-11-26")).toContainElement(within(empty).getByTestId("calendar-day-empty"));
    // A day with classes keeps its count.
    expect(screen.getByTestId("calendar-day-section-2026-11-25")).toHaveTextContent("calendar.mobile.classCount");
  });

  it("[CALENDAR-MOBILE-VIEWS-40] a wheel or a touch during the movement stops it and hands the list back", async () => {
    const { select } = mount();
    await waitFor(() => expect(sections()).toHaveLength(49));
    await waitFor(() => expect(screen.getByTestId("target")).toHaveTextContent(""));
    const scrollTo = Element.prototype.scrollTo as unknown as ReturnType<typeof vi.fn>;
    scrollTo.mockClear();
    const list = screen.getByTestId("calendar-day-list");

    await select(new Date(2026, 11, 3));
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-03");
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));

    // The reader's wheel: the animation is cancelled where the list stands (a scroll to its own place), and the
    // target ends at once, with no scroll event needed.
    await act(async () => {
      fireEvent.wheel(list);
    });
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto", top: list.scrollTop }));
    expect(screen.getByTestId("target")).toHaveTextContent("");

    // And a touch, the same.
    await select(new Date(2026, 11, 9));
    expect(screen.getByTestId("target")).toHaveTextContent("2026-12-09");
    await act(async () => {
      fireEvent.touchStart(list);
    });
    expect(screen.getByTestId("target")).toHaveTextContent("");
  });
});
