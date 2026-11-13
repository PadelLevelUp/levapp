/**
 * classes.class-requests rule 14a (PAD-428): the weekly private-class step's
 * two ways to end — "on a date" (unchanged) and "after N classes", turned into
 * `endDate` on the client through @levelup/config's `endDateAfterClasses`.
 * Asserted by test id / call args, never by rendered copy (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MAX_REQUEST_CLASSES } from "@levelup/config";

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
  it("[CLASSES-CLASS-REQUESTS-20] Tue+Thu from 2026-10-06 with N=4 shows the last class 2026-10-15 and submits endDate 2026-10-15", async () => {
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
    expect(screen.getByTestId("request-end-count").textContent).toBe("4");

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

describe("the class-count stepper (rule 14a, PAD-428, PAD-926)", () => {
  it("[CLASSES-CLASS-REQUESTS-36] steps by one class and the last date follows the count", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({ freeWindows: {}, workingHoursSource: "custom" });

    renderStep();
    await goWeekly(["wizard-weekday-2"], "2026-10-06");

    fireEvent.click(screen.getByTestId("request-end-mode-count"));
    fireEvent.click(screen.getByTestId("request-end-count-dec"));
    expect(screen.getByTestId("request-end-count").textContent).toBe("3");

    // Tue from 2026-10-06, 3 classes -> 10-06, 10-13, 10-20.
    expect((await screen.findByTestId("request-end-count-last-date")).textContent).toContain("10/20/2026");
  });

  it("[CLASSES-CLASS-REQUESTS-36] stays within 1 and the largest allowed count, disabling the button at each end", () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({ freeWindows: {}, workingHoursSource: "custom" });

    renderStep();
    fireEvent.click(screen.getByTestId("wizard-recurrence-weekly"));
    fireEvent.click(screen.getByTestId("request-end-mode-count"));
    const dec = screen.getByTestId("request-end-count-dec") as HTMLButtonElement;
    const inc = screen.getByTestId("request-end-count-inc") as HTMLButtonElement;
    for (let i = 0; i < 10; i++) fireEvent.click(dec);
    expect(screen.getByTestId("request-end-count").textContent).toBe("1");
    expect(dec.disabled).toBe(true);
    for (let i = 0; i < MAX_REQUEST_CLASSES + 5; i++) fireEvent.click(inc);
    expect(screen.getByTestId("request-end-count").textContent).toBe(String(MAX_REQUEST_CLASSES));
    expect(inc.disabled).toBe(true);
  });

  it("[CLASSES-CLASS-REQUESTS-36] a stepper at 6 sends 6 classes: Tue from 2026-10-06 ends 2026-11-10", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({
      freeWindows: Object.fromEntries(
        ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10"].map((d) => [d, [WINDOW]])
      ),
      workingHoursSource: "custom",
    });

    renderStep();
    await goWeekly(["wizard-weekday-2"], "2026-10-06");
    fireEvent.click(screen.getByTestId("request-end-mode-count"));
    fireEvent.click(screen.getByTestId("request-end-count-inc"));
    fireEvent.click(screen.getByTestId("request-end-count-inc"));
    expect(screen.getByTestId("request-end-count").textContent).toBe("6");

    fireEvent.click(await screen.findByTestId("wizard-slot"));
    fireEvent.click(screen.getByTestId("wizard-send"));

    await waitFor(() =>
      expect(requestsApi.createClassRequest).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: { weekdays: [2], startDate: "2026-10-06", endDate: "2026-11-10" } })
      )
    );
  });

  it("[CLASSES-CLASS-REQUESTS-36] the segmented control swaps the date field for the stepper and back", () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({ freeWindows: {}, workingHoursSource: "custom" });

    renderStep();
    fireEvent.click(screen.getByTestId("wizard-recurrence-weekly"));
    expect(screen.getByTestId("wizard-end-date")).toBeTruthy();
    expect(screen.queryByTestId("request-end-count")).toBeNull();
    fireEvent.click(screen.getByTestId("request-end-mode-count"));
    expect(screen.queryByTestId("wizard-end-date")).toBeNull();
    expect(screen.getByTestId("request-end-mode-count").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByTestId("request-end-mode-date"));
    expect(screen.getByTestId("wizard-end-date")).toBeTruthy();
  });
});

describe("\"on a date\" (rule 14a, PAD-428)", () => {
  it("[CLASSES-CLASS-REQUESTS-21] propagates the picked end date exactly as before PAD-428", async () => {
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
