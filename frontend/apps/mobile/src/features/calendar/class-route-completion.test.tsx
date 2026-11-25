/**
 * calendar.event-detail rule 15 / CALENDAR-EVENT-DETAIL-40 (PO M-6994): a `LessonInstance` route that has an
 * id but lacks `date`, `startTime`, `endTime` or `maxPlayers` (a dashboard card, a message link, the
 * attendance history, an href with no date) is completed from `GET /lesson_instance/<id>`, once per open;
 * a complete route (the calendar tap) and a `Lesson` series make no read; a failed read keeps what the route
 * renders. Tested on `useClassRouteEvent`, the hook the class screen takes its event from.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({ getLessonInstanceById: vi.fn() }));
vi.mock("@levelup/api/src/resources/classes", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLessonInstanceById: api.getLessonInstanceById,
}));

import { useClassRouteEvent } from "./useClassRouteEvent";
import { eventToParams, type ClassRouteParams } from "./params";
import { nativeRouteForWebPath } from "@/features/dashboard/routes";

const INSTANCE = {
  id: 7,
  lessonId: 3,
  date: "2026-07-07",
  startTime: "19:30",
  endTime: "21:00",
  status: "scheduled",
  name: "Aula de terça",
  color: "#123456",
  maxPlayers: 8,
};

type Seen = ReturnType<typeof useClassRouteEvent>;
let client: QueryClient;
let seen: Seen;

function Probe({ params }: { params: Partial<Record<keyof ClassRouteParams, string>> }) {
  seen = useClassRouteEvent(params);
  return null;
}
async function mount(params: Partial<Record<keyof ClassRouteParams, string>>) {
  const el = (p: typeof params) => (
    <QueryClientProvider client={client}>
      <Probe params={p} />
    </QueryClientProvider>
  );
  const view = await renderNative(el(params));
  await view.flush();
  return { view, again: (p = params) => view.rerender(el({ ...p })) };
}
const dashboardParams = (href: string, hint = { title: "Aula", timeLabel: "19:30" }) => {
  const route = nativeRouteForWebPath(href, hint);
  if (!route || route.pathname !== "/class/[id]") throw new Error("not a class route");
  return route.params as Partial<Record<keyof ClassRouteParams, string>>;
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  api.getLessonInstanceById.mockReset().mockResolvedValue({ lessonInstance: INSTANCE });
});
afterEach(() => client.clear());

describe("a LessonInstance route with missing date, times or capacity is completed from its id", () => {
  it("[CALENDAR-EVENT-DETAIL-40] a dashboard route (date and a start label, no end time or capacity) reads once and shows them", async () => {
    const { view, again } = await mount(dashboardParams("/calendar?classId=lessoninstance-7&date=2026-07-07"));
    expect(api.getLessonInstanceById).toHaveBeenCalledTimes(1);
    expect(api.getLessonInstanceById).toHaveBeenCalledWith(7);
    expect(seen.event).toMatchObject({ date: "2026-07-07", startTime: "19:30", endTime: "21:00", maxPlayers: 8 });
    // The route's own values win: its start label and title stay.
    expect(seen.event).toMatchObject({ title: "Aula" });
    // Re-rendering, and the app coming back to the foreground, read nothing more.
    await again();
    await act(async () => focusManager.setFocused(true));
    await view.flush();
    expect(api.getLessonInstanceById).toHaveBeenCalledTimes(1);
  });

  it("[CALENDAR-EVENT-DETAIL-40] the class payload is not asked for until the read has given the date", async () => {
    let release: (v: unknown) => void = () => undefined;
    api.getLessonInstanceById.mockReturnValue(new Promise((r) => (release = r)));
    const { view } = await mount(dashboardParams("/calendar?classId=lessoninstance-7&date=2026-07-07"));
    expect(seen.classEvent).toBeNull(); // pending: class_instance waits for the read
    expect(seen.event).toMatchObject({ date: "2026-07-07", title: "Aula" }); // the header renders from the route meanwhile
    await act(async () => release({ lessonInstance: INSTANCE }));
    await view.flush();
    expect(seen.classEvent).toMatchObject({ date: "2026-07-07" });
  });

  it("[CALENDAR-EVENT-DETAIL-40] a message link with a date, an href with none, and an attendance-history row all complete", async () => {
    await mount(dashboardParams("/calendar?classId=lessoninstance-7&date=2026-07-07", { title: "", timeLabel: "" }));
    expect(seen.event).toMatchObject({ date: "2026-07-07", startTime: "19:30", endTime: "21:00", maxPlayers: 8 });
    client.clear();
    api.getLessonInstanceById.mockClear();
    await mount(dashboardParams("/calendar?classId=lessoninstance-7"));
    expect(seen.event).toMatchObject({ date: "2026-07-07", startTime: "19:30" });
    client.clear();
    api.getLessonInstanceById.mockClear();
    // AttendanceHistoryList: id, model, originalId, date, title, color, isRecurring only.
    await mount({ id: "lessoninstance-7", model: "LessonInstance", originalId: "7", date: "2026-07-07", title: "Aula", color: "#123456", isRecurring: "0" });
    expect(api.getLessonInstanceById).toHaveBeenCalledTimes(1);
    expect(seen.event).toMatchObject({ startTime: "19:30", endTime: "21:00", maxPlayers: 8 });
  });

  it("[CALENDAR-EVENT-DETAIL-40] an id-only route is resolved as before (criterion 13)", async () => {
    await mount({ id: "lessoninstance-7" });
    expect(api.getLessonInstanceById).toHaveBeenCalledTimes(1);
    expect(seen.fallbackId).toBe(7);
    expect(seen.event).toMatchObject({ date: "2026-07-07", endTime: "21:00" });
  });

  it("[CALENDAR-EVENT-DETAIL-40] a complete route (the calendar tap) and a Lesson series make no read", async () => {
    const complete = eventToParams({
      id: "lessoninstance-7", model: "LessonInstance", originalId: 7, type: "class", isRecurring: false,
      date: "2026-07-07", startTime: "19:30", endTime: "21:00", title: "Aula", maxPlayers: 8,
    } as never);
    await mount(complete);
    expect(api.getLessonInstanceById).not.toHaveBeenCalled();
    expect(seen.event).toMatchObject({ date: "2026-07-07", endTime: "21:00" });
    await mount(dashboardParams("/calendar?classId=lesson-3-2026-07-07"));
    expect(api.getLessonInstanceById).not.toHaveBeenCalled();
  });

  it("[CALENDAR-EVENT-DETAIL-40] a failed read keeps what the route shows, and is not the id-only 'gone' state", async () => {
    api.getLessonInstanceById.mockRejectedValue(Object.assign(new Error("gone"), { response: { status: 404 } }));
    await mount(dashboardParams("/calendar?classId=lessoninstance-7&date=2026-07-07"));
    expect(seen.event).toMatchObject({ date: "2026-07-07", startTime: "19:30", title: "Aula" });
    expect(seen.classEvent).toMatchObject({ date: "2026-07-07" }); // class_instance still asked, with the date
    expect(seen.fallbackId).toBeNull(); // rule 15's gone/retry states belong to an id-only route
  });
});
