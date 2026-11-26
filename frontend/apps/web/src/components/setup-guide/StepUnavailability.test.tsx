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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StepUnavailability guide={guide} onDone={onDone} onLeave={() => {}} />
    </QueryClientProvider>
  );
  return { guide, onDone, client };
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

describe("saved schedule card text", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-31] a Varia schedule's card says each day's hours, never Livre", async () => {
    renderStep([
      row(1, { startTime: "09:00", endTime: "11:00", recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 3] } }),
      row(2, { startTime: "09:00", endTime: "20:00", recurrenceRule: { frequency: "weekly", daysOfWeek: [2] } }),
    ]);
    const card = await screen.findByTestId("setup-saved-schedule");
    expect(card.textContent).toContain("seg 09–11; ter 09–20; qua 09–11");
    expect(card.textContent).not.toContain("setupGuide.editor.weekFree");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-15] a failed always-available save stays on the step and says so", async () => {
    vi.mocked(availabilityApi.listBlockers).mockResolvedValue([]);
    const guide = makeGuide();
    vi.mocked(guide.write).mockRejectedValueOnce(new Error("down"));
    const onDone = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StepUnavailability guide={guide} onDone={onDone} onLeave={() => {}} />
      </QueryClientProvider>
    );
    await userEvent.setup().click(screen.getByTestId("setup-always-available"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-26] a schedule over a class saves and moves on without asking", async () => {
    const { onDone, client } = renderStep();
    const invalidated = vi.spyOn(client, "invalidateQueries");
    const user = userEvent.setup({ advanceTimers: () => {} });
    await user.click(screen.getByTestId("setup-preset-work_weekdays"));
    await user.click(screen.getByTestId("setup-unavailability-save"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    // Only the PUT is made: no read before it, no question, and the guide moved on after it succeeded.
    expect(availabilityApi.putSchedule).toHaveBeenCalledTimes(1);
    expect(Object.keys(availabilityApi)).not.toContain("readScheduleCoveredClasses");
    expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(vi.mocked(availabilityApi.putSchedule).mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
    // The server marked the classes the rows cover; the calendar, class screens and dashboard are read again.
    const keys = invalidated.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(["calendar-events"]), JSON.stringify(["dashboard"])]));
  });

  it("[CALENDAR-STUDENT-BLOCKERS-32] the schedule step says classes in the period are marked", async () => {
    renderStep();
    const notice = screen.getByTestId("blocker-covered-notice");
    expect(notice.textContent).toBe("availability.covered.notice");
    // Above the save button, and no request was made to show it.
    expect(notice.compareDocumentPosition(screen.getByTestId("setup-unavailability-save")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(availabilityApi.putSchedule).not.toHaveBeenCalled();
  });
});
