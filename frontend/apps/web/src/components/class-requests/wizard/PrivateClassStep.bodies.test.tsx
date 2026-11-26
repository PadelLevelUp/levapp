/**
 * classes.class-requests criterion 59 (rule 21), the recording half: what the OLD single-form private step posts.
 * The bodies are the fixed literals in `private-request-bodies.fixture`, the ones the three steps must also send.
 * This test passes on the single form; it is the baseline, not a test of new behaviour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PRIVATE_REQUEST_COACH,
  PRIVATE_REQUEST_FREE_WINDOW,
  PRIVATE_REQUEST_NOTE,
  SINGLE_WITH_INVITEE_BODY,
  WEEKLY_AFTER_3_CLASSES_BODY,
} from "@levelup/config/src/private-request-bodies.fixture";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const requests = vi.hoisted(() => ({ createClassRequest: vi.fn() }));
vi.mock("@/api/classRequests", () => ({ createClassRequest: requests.createClassRequest, classRequestRefusal: () => null }));
const availabilityApi = vi.hoisted(() => ({ getRequestParticipants: vi.fn(), getCoachAvailability: vi.fn() }));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn().mockResolvedValue({ classes: [] }) }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { PrivateClassStep } from "./PrivateClassStep";

function renderStep() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PrivateClassStep coachId={PRIVATE_REQUEST_COACH} onDone={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  availabilityApi.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ ...PRIVATE_REQUEST_FREE_WINDOW }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
  availabilityApi.getRequestParticipants.mockImplementation(async (_c: string, names: string[]) =>
    names.map((username) => ({ username, ok: true, name: username }))
  );
  requests.createClassRequest.mockReset().mockResolvedValue({});
});

describe("what the single form posts (the baseline of criterion 59)", () => {
  it("[CLASSES-CLASS-REQUESTS-59] a single request with an invitee posts the fixed body", async () => {
    renderStep();
    fireEvent.click(screen.getByTestId("wizard-people-2"));
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "carla" } });
    fireEvent.change(screen.getByTestId("wizard-date"), { target: { value: SINGLE_WITH_INVITEE_BODY.date } });
    fireEvent.change(screen.getByTestId("wizard-note"), { target: { value: PRIVATE_REQUEST_NOTE } });
    fireEvent.click(await screen.findByTestId("wizard-slot", undefined, { timeout: 2000 }));
    await waitFor(() => expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(false), { timeout: 2000 });
    fireEvent.click(screen.getByTestId("wizard-send"));
    await waitFor(() => expect(requests.createClassRequest).toHaveBeenCalledTimes(1));
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(SINGLE_WITH_INVITEE_BODY);
  });

  it("[CLASSES-CLASS-REQUESTS-59] a weekly request ending after 3 classes posts the fixed body", async () => {
    renderStep();
    fireEvent.click(screen.getByTestId("wizard-recurrence-weekly"));
    fireEvent.click(screen.getByTestId("wizard-weekday-2"));
    fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: WEEKLY_AFTER_3_CLASSES_BODY.recurrence.startDate } });
    fireEvent.click(screen.getByTestId("request-end-mode-count"));
    fireEvent.click(screen.getByTestId("request-end-count-dec"));
    expect(screen.getByTestId("request-end-count").textContent).toBe("3");
    fireEvent.click(await screen.findByTestId("wizard-slot"));
    fireEvent.click(screen.getByTestId("wizard-send"));
    await waitFor(() => expect(requests.createClassRequest).toHaveBeenCalledTimes(1));
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(WEEKLY_AFTER_3_CLASSES_BODY);
  });
});
