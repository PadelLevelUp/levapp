/**
 * dashboard.student-setup-guide rule 9 (PAD-839). The component lives at
 * `components/setup-guide/ScheduleEditor.tsx`; this file sits at the path the spec names.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emptySchedule } from "@levelup/config";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key) }),
}));
vi.mock("@levelup/api/src/resources/availability", () => ({
  listBlockers: vi.fn(),
  putSchedule: vi.fn().mockResolvedValue([]),
  deleteSchedule: vi.fn().mockResolvedValue(undefined),
}));

import * as availabilityApi from "@levelup/api/src/resources/availability";
import { ScheduleEditor } from "@/components/setup-guide/ScheduleEditor";
import { StepUnavailability } from "@/components/setup-guide/StepUnavailability";
import { makeGuide, userEvent } from "@/components/setup-guide/guide-fixture";

beforeEach(() => vi.clearAllMocks());

const tap = (user: ReturnType<typeof userEvent.setup>, ...ids: string[]) =>
  ids.reduce((p, id) => p.then(() => user.click(screen.getByTestId(id))), Promise.resolve());

const rows = (): availabilityApi.AvailabilityBlocker[] => {
  const base = {
    userId: 1, type: "unavailable", title: "Trabalho", description: null, isRecurring: true,
    recurrenceRule: { frequency: "weekly", daysOfWeek: [1, 2, 3, 4, 5] }, recurrenceEnd: "2099-12-31",
    blocksAutoInvitations: true, date: "2026-11-01", scheduleId: "s1" as string | null,
  };
  return [
    { ...base, id: 1, startTime: "09:00", endTime: "11:00" },
    { ...base, id: 2, startTime: "15:00", endTime: "17:00" },
    { ...base, id: 3, startTime: "19:00", endTime: "21:00" },
    // The hand-made block: no schedule, Saturday 12:00-13:00.
    { ...base, id: 9, title: "Médico", scheduleId: null, recurrenceRule: { frequency: "weekly", daysOfWeek: [6] }, startTime: "12:00", endTime: "13:00" },
  ];
};

describe("ScheduleEditor", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-13] a :30 end renders the hour half filled", async () => {
    const user = userEvent.setup();
    render(<ScheduleEditor open initial={emptySchedule()} editing={false} onSave={() => {}} onClose={() => {}} />);
    await tap(user, "schedule-hour-09", "schedule-hour-13");
    expect(screen.getByTestId("schedule-hour-12").getAttribute("data-cell")).toBe("busy");
    expect(screen.getByTestId("schedule-hour-13").getAttribute("data-cell")).toBe("free_end");

    await tap(user, "schedule-period-0-end-plus");
    expect(screen.getByTestId("schedule-hour-13").getAttribute("data-cell")).toBe("half");
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-14] save is disabled until a day has a period, and Editar opens the schedule's rows only", async () => {
    const user = userEvent.setup();

    // Save waits for a day and a period.
    const onSave = vi.fn();
    const first = render(<ScheduleEditor open initial={emptySchedule()} editing={false} onSave={onSave} onClose={() => {}} />);
    const save = () => screen.getByTestId("schedule-save") as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    await tap(user, "schedule-day-1");
    expect(save().disabled).toBe(true); // a day, no period
    await tap(user, "schedule-day-1", "schedule-hour-09", "schedule-hour-11");
    expect(save().disabled).toBe(true); // a period, no day
    await tap(user, "schedule-day-1");
    expect(save().disabled).toBe(false);
    first.unmount();

    // Editar opens the saved schedule's three rows, not the hand-made block.
    vi.mocked(availabilityApi.listBlockers).mockResolvedValue(rows());
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StepUnavailability guide={makeGuide()} onDone={() => {}} onLeave={() => {}} />
      </QueryClientProvider>
    );
    await user.click(await screen.findByTestId("setup-schedule-edit"));
    expect(screen.getByTestId("schedule-editor")).toBeTruthy();
    expect(screen.getAllByTestId(/^schedule-period-\d+$/)).toHaveLength(3);
    expect(screen.getByTestId("schedule-hour-12").getAttribute("data-cell")).not.toBe("busy");

    // Remove one period and save: the remaining rows under the same scheduleId.
    await tap(user, "schedule-period-2-remove", "schedule-save");
    await waitFor(() => expect(availabilityApi.putSchedule).toHaveBeenCalledTimes(1));
    const [id, body] = vi.mocked(availabilityApi.putSchedule).mock.calls[0];
    expect(id).toBe("s1");
    expect(body.blockers.map((b) => [b.startTime, b.endTime])).toEqual([["09:00", "11:00"], ["15:00", "17:00"]]);

    // Open again and delete the schedule.
    await user.click(await screen.findByTestId("setup-schedule-edit"));
    await tap(user, "schedule-delete");
    await waitFor(() => expect(availabilityApi.deleteSchedule).toHaveBeenCalledWith("s1"));
    expect(availabilityApi.deleteSchedule).toHaveBeenCalledTimes(1);
  });
});
