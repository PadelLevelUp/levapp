/** dashboard.student-setup-guide rules 8, 10, 18 (PAD-839): step 3 on web. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key) }),
}));
vi.mock("@levelup/api/src/resources/availability", () => ({
  listBlockers: vi.fn(),
  putSchedule: vi.fn().mockResolvedValue([]),
  deleteSchedule: vi.fn().mockResolvedValue(undefined),
}));

import * as availabilityApi from "@levelup/api/src/resources/availability";
import { StepUnavailability } from "./StepUnavailability";
import { makeGuide, userEvent } from "./guide-fixture";

const row = (id: number, o: Partial<availabilityApi.AvailabilityBlocker> = {}): availabilityApi.AvailabilityBlocker => ({
  id,
  userId: 1,
  type: "unavailable",
  title: "Trabalho",
  description: null,
  isRecurring: true,
  recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] },
  recurrenceEnd: "2026-12-31",
  blocksAutoInvitations: true,
  date: "2026-11-01",
  startTime: "09:00",
  endTime: "11:00",
  scheduleId: "s1",
  ...o,
});

const renderStep = (blockers: availabilityApi.AvailabilityBlocker[] = []) => {
  vi.mocked(availabilityApi.listBlockers).mockResolvedValue(blockers);
  const guide = makeGuide();
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StepUnavailability guide={guide} onDone={onDone} onLeave={() => {}} />
    </QueryClientProvider>
  );
  return { guide, onDone };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("StepUnavailability", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-15] always available saves and moves on", async () => {
    const { guide, onDone } = renderStep();
    await userEvent.setup({ advanceTimers: () => {} }).click(screen.getByTestId("setup-always-available"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(guide.write).toHaveBeenCalledTimes(1);
    expect(guide.write).toHaveBeenCalledWith({ alwaysAvailable: true });
    expect(vi.mocked(guide.write).mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
    expect(availabilityApi.putSchedule).not.toHaveBeenCalled();
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-16] a preset saves one schedule and moves on", async () => {
    const { onDone } = renderStep();
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(screen.getByTestId("setup-preset-work_weekdays"));
    await user.click(screen.getByTestId("setup-unavailability-save"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    expect(availabilityApi.putSchedule).toHaveBeenCalledTimes(1);
    const [scheduleId, body] = vi.mocked(availabilityApi.putSchedule).mock.calls[0];
    expect(scheduleId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.title).toBe("Trabalho");
    expect(body.blockers).toHaveLength(1);
    expect(body.blockers[0]).toMatchObject({
      title: "Trabalho",
      startTime: "09:00",
      endTime: "18:00",
      isRecurring: true,
      recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] },
    });
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-28] shows the end and Prolongar extends every row", async () => {
    renderStep([row(1), row(2, { startTime: "15:00", endTime: "20:00", recurrenceEnd: "2026-12-15" })]);
    const user = userEvent.setup({ advanceTimers: () => {} });
    const end = await screen.findByTestId("setup-schedule-end");
    expect(end.getAttribute("data-state")).toBe("ends");

    await user.click(screen.getByTestId("setup-schedule-extend"));
    await waitFor(() => expect(availabilityApi.putSchedule).toHaveBeenCalledTimes(1));
    const [scheduleId, body] = vi.mocked(availabilityApi.putSchedule).mock.calls[0];
    expect(scheduleId).toBe("s1");
    // later(2026-12-31, 2026-11-19) + 3 months
    expect(body.blockers.map((b) => b.endDate)).toEqual(["2027-03-31", "2027-03-31"]);
    expect(body.blockers.map((b) => b.startTime)).toEqual(["09:00", "15:00"]);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-28] an ended schedule says so and Prolongar counts from today", async () => {
    renderStep([row(1, { recurrenceEnd: "2026-10-01" })]);
    const user = userEvent.setup({ advanceTimers: () => {} });
    expect((await screen.findByTestId("setup-schedule-end")).getAttribute("data-state")).toBe("ended");
    await user.click(screen.getByTestId("setup-schedule-extend"));
    await waitFor(() => expect(availabilityApi.putSchedule).toHaveBeenCalledTimes(1));
    expect(vi.mocked(availabilityApi.putSchedule).mock.calls[0][1].blockers[0].endDate).toBe("2027-02-19");
  });
});
