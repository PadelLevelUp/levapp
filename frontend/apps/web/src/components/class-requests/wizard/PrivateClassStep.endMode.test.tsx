/**
 * classes.class-requests rule 14a (PAD-428): the weekly private-class step's
 * two ways to end — "on a date" (unchanged) and "after N classes", turned into
 * `endDate` on the client through @levelup/config's `endDateAfterClasses`.
 * Asserted by test id / call args, never by rendered copy (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "en" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const requestsApi = vi.hoisted(() => ({
  createClassRequest: vi.fn().mockResolvedValue({}),
  classRequestRefusal: () => null,
}));
vi.mock("@/api/classRequests", () => requestsApi);

const availabilityApi = vi.hoisted(() => ({
  getRequestParticipants: vi.fn().mockResolvedValue([]),
  getCoachAvailability: vi.fn(),
}));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi }));

import { PrivateClassStep } from "./PrivateClassStep";

const WINDOW = { startTime: "18:00", endTime: "19:00" };

function renderStep() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PrivateClassStep coachId="ana-id" onDone={vi.fn()} />
    </QueryClientProvider>
  );
}

async function goWeekly(weekdayTestIds: string[], startDate: string) {
  fireEvent.click(screen.getByTestId("wizard-recurrence-weekly"));
  for (const id of weekdayTestIds) fireEvent.click(screen.getByTestId(id));
  fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: startDate } });
}

afterEach(() => {
  requestsApi.createClassRequest.mockClear();
  availabilityApi.getCoachAvailability.mockReset();
  availabilityApi.getRequestParticipants.mockReset().mockResolvedValue([]);
});

describe("\"after N classes\" (rule 14a, PAD-428)", () => {
  it("Tue+Thu from 2026-10-06 with N=4 shows the last class 2026-10-15 and submits endDate 2026-10-15", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({
      freeWindows: {
        "2026-10-06": [WINDOW],
        "2026-10-08": [WINDOW],
        "2026-10-13": [WINDOW],
        "2026-10-15": [WINDOW],
      },
      workingHoursSource: "custom",
    });

    renderStep();
    await goWeekly(["wizard-weekday-2", "wizard-weekday-4"], "2026-10-06");

    fireEvent.click(screen.getByTestId("request-end-mode-count"));
    fireEvent.change(screen.getByTestId("request-end-count"), { target: { value: "4" } });

    const lastDate = await screen.findByTestId("request-end-count-last-date");
    expect(lastDate.textContent).toContain("10/15/2026");

    const slot = await screen.findByTestId("wizard-slot");
    fireEvent.click(slot);
    fireEvent.click(screen.getByTestId("wizard-send"));

    await waitFor(() =>
      expect(requestsApi.createClassRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-10-06",
          recurrence: { weekdays: [2, 4], startDate: "2026-10-06", endDate: "2026-10-15" },
        })
      )
    );
  });
});

describe("\"on a date\" (rule 14a, PAD-428)", () => {
  it("propagates the picked end date exactly as before PAD-428", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({
      freeWindows: { "2026-10-06": [WINDOW] },
      workingHoursSource: "custom",
    });

    renderStep();
    await goWeekly(["wizard-weekday-2"], "2026-10-06");
    fireEvent.change(screen.getByTestId("wizard-end-date"), { target: { value: "2026-10-06" } });

    const slot = await screen.findByTestId("wizard-slot");
    fireEvent.click(slot);
    fireEvent.click(screen.getByTestId("wizard-send"));

    await waitFor(() =>
      expect(requestsApi.createClassRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-10-06",
          recurrence: { weekdays: [2], startDate: "2026-10-06", endDate: "2026-10-06" },
        })
      )
    );
  });
});
