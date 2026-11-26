// @vitest-environment jsdom
/**
 * classes.class-requests rule 21: the private class's one draft, owned by the shell. Its answers survive a step
 * change, are empty for another coach and after a reset, "Continuar" is enabled by the step-answered rules, and the
 * 400 ms lock starts at `markShown()`. Located by values; the roster check and the availability read are mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ getRequestParticipants: vi.fn(), getCoachAvailability: vi.fn() }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: api }));

import { usePrivateRequestDraft } from "./usePrivateRequestDraft";

const NOW = new Date("2026-11-26T10:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  api.getRequestParticipants.mockImplementation(async (_c: string, names: string[]) => names.map((username) => ({ username, ok: true, name: username })));
  api.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ startTime: "09:00", endTime: "13:00" }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
});
afterEach(() => {
  vi.useRealTimers();
  api.getRequestParticipants.mockReset();
  api.getCoachAvailability.mockReset();
});

const mount = (coachId = "ana") => renderHook(({ id }: { id: string }) => usePrivateRequestDraft(id), { initialProps: { id: coachId } });
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 450)); }); };

describe("the draft keeps and drops answers (criterion 57's logic)", () => {
  it("[CLASSES-CLASS-REQUESTS-57] keeps every answer for the same coach, drops them for another, and for A after B", async () => {
    const h = mount("ana");
    act(() => { h.result.current.setPeople(2); h.result.current.setNote("olá"); h.result.current.setDuration(90); });
    expect(h.result.current.people).toBe(2);
    h.rerender({ id: "ana" });
    expect(h.result.current.note).toBe("olá");
    h.rerender({ id: "bia" });
    expect(h.result.current.people).toBe(1);
    expect(h.result.current.note).toBe("");
    h.rerender({ id: "ana" });
    expect(h.result.current.people).toBe(1);
    expect(h.result.current.duration).toBe(60);
  });

  it("[CLASSES-CLASS-REQUESTS-57] reset() empties the draft, as a reopened sheet does", () => {
    const h = mount();
    act(() => { h.result.current.setNote("olá"); h.result.current.setRecurring("weekly"); });
    act(() => h.result.current.reset());
    expect(h.result.current.note).toBe("");
    expect(h.result.current.recurring).toBe("single");
  });

  it("[CLASSES-CLASS-REQUESTS-57] confirmDate() makes the date the student's own: the first free day no longer moves it", async () => {
    api.getCoachAvailability.mockImplementation(async ({ from }: { from: string }) => ({
      freeWindows: from === "2026-11-26" ? { "2026-11-28": [{ startTime: "09:00", endTime: "13:00" }] } : {},
      workingHoursSource: "custom",
    }));
    const h = mount();
    await waitFor(() => expect(h.result.current.date).toBe("2026-11-28"));
    const own = mount();
    act(() => own.result.current.confirmDate());
    await settle();
    expect(own.result.current.date).toBe("2026-11-26");
  });
});

describe("a step is answered (rule 21, criteria 55, 56, 61)", () => {
  it("[CLASSES-CLASS-REQUESTS-61] people: one person, a rostered name, never a repeated one", async () => {
    const h = mount();
    expect(h.result.current.stepAnswered("people")).toBe(true);
    act(() => h.result.current.setPeople(3));
    expect(h.result.current.stepAnswered("people")).toBe(false);
    act(() => h.result.current.setUsernames(["carla", " Carla "]));
    await settle();
    expect(h.result.current.stepAnswered("people")).toBe(false);
    act(() => h.result.current.setUsernames(["carla", "dana"]));
    await settle();
    expect(h.result.current.stepAnswered("people")).toBe(true);
  });

  it("[CLASSES-CLASS-REQUESTS-61] when: an empty or past single date is not an answer, today is", () => {
    const h = mount();
    act(() => h.result.current.setDate(""));
    expect(h.result.current.stepAnswered("when")).toBe(false);
    act(() => h.result.current.setDate("2026-11-25"));
    expect(h.result.current.stepAnswered("when")).toBe(false);
    act(() => h.result.current.setDate("2026-11-26"));
    expect(h.result.current.stepAnswered("when")).toBe(true);
  });

  it("[CLASSES-CLASS-REQUESTS-61] when: a weekly answer needs a weekday and a start, and an empty start never throws", () => {
    const h = mount();
    act(() => h.result.current.setRecurring("weekly"));
    expect(h.result.current.stepAnswered("when")).toBe(false);
    act(() => h.result.current.setWeekdays([2]));
    expect(h.result.current.stepAnswered("when")).toBe(true);
    for (const mode of ["date", "count"] as const) {
      act(() => h.result.current.setEndMode(mode));
      expect(() => act(() => h.result.current.setStartDate(""))).not.toThrow();
      expect(h.result.current.stepAnswered("when")).toBe(false);
      act(() => h.result.current.setStartDate("2026-11-26"));
      expect(h.result.current.stepAnswered("when")).toBe(true);
    }
  });

  it("[CLASSES-CLASS-REQUESTS-61] time: needs a picked time, and a new duration clears it (criterion 54)", async () => {
    const h = mount();
    await waitFor(() => expect(h.result.current.slotsState).toBe("ready"));
    expect(h.result.current.stepAnswered("time")).toBe(false);
    act(() => h.result.current.setSlot({ startTime: "10:00", endTime: "11:00" }));
    expect(h.result.current.stepAnswered("time")).toBe(true);
    act(() => h.result.current.setDuration(90));
    expect(h.result.current.slot).toBeNull();
    expect(h.result.current.stepAnswered("time")).toBe(false);
  });
});

describe("the 400 ms lock starts at markShown() (criterion 66's logic)", () => {
  it("[CLASSES-CLASS-REQUESTS-66] a press under 400 ms after the step shows does nothing, at 401 ms it moves, a second press 100 ms later does not", () => {
    const h = mount();
    act(() => h.result.current.markShown());
    expect(h.result.current.canAdvance()).toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 399));
    expect(h.result.current.canAdvance()).toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 401));
    expect(h.result.current.canAdvance()).toBe(true);
    // The shell moved one step and marks the new one shown: the second tap lands inside its lock.
    act(() => h.result.current.markShown());
    vi.setSystemTime(new Date(NOW.getTime() + 501));
    expect(h.result.current.canAdvance()).toBe(false);
  });

  it("[CLASSES-CLASS-REQUESTS-66] nothing can advance before a step has been shown", () => {
    expect(mount().result.current.canAdvance()).toBe(false);
  });
});

describe("no coach, no read (code review S1)", () => {
  it("[CLASSES-CLASS-REQUESTS-57] makes no availability or roster call while the coach id is empty, and reads once it is set", async () => {
    const h = mount("");
    await settle();
    expect(api.getCoachAvailability).not.toHaveBeenCalled();
    expect(api.getRequestParticipants).not.toHaveBeenCalled();
    h.rerender({ id: "ana" });
    await settle();
    expect(api.getCoachAvailability).toHaveBeenCalled();
    expect(api.getCoachAvailability.mock.calls.every(([a]: [{ coachId: string }]) => a.coachId === "ana")).toBe(true);
  });
});
