/**
 * Private step bugs reported by ui-inspiration's reviewer (no ticket): a length change after picking a
 * time kept the old end (rule 13), a cleared weekly start date threw at render (rule 14a), and the
 * same username twice passed on the client (rule 12). Asserted by test id and call args.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const requests = vi.hoisted(() => ({ createClassRequest: vi.fn() }));
vi.mock("@/api/classRequests", () => ({ createClassRequest: requests.createClassRequest, classRequestRefusal: () => null }));
const availabilityApi = vi.hoisted(() => ({
  getRequestParticipants: vi.fn(),
  getCoachAvailability: vi.fn(),
}));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn().mockResolvedValue({ classes: [] }) }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { renderPrivateStep } from "@/test/privateStepHost";

// Inside the default 28-day end of the "until a date" ending.
const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const state = () => screen.getByTestId("wizard-slots").getAttribute("data-state");
const startTimes = () => screen.queryAllByTestId("wizard-slot").map((b) => b.getAttribute("data-start"));
const slotButton = (start: string) =>
  screen.getAllByTestId("wizard-slot").find((b) => b.getAttribute("data-start") === start) as HTMLElement;

beforeEach(() => {
  // Every requested day is free from 09:00 to 13:00.
  availabilityApi.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ startTime: "09:00", endTime: "13:00" }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
  availabilityApi.getRequestParticipants.mockImplementation(async (_coach: string, names: string[]) =>
    names.map((username) => ({ username, ok: true, name: username }))
  );
  requests.createClassRequest.mockReset().mockResolvedValue({});
});

afterEach(() => {
  availabilityApi.getCoachAvailability.mockReset();
  availabilityApi.getRequestParticipants.mockReset();
});

describe("a length change after picking a time (rule 13)", () => {
  it("[CLASSES-CLASS-REQUESTS-54] a length change clears the picked time", async () => {
    renderPrivateStep("time");
    await waitFor(() => expect(state()).toBe("ready"));
    fireEvent.click(slotButton("10:00"));
    expect(slotButton("10:00").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("wizard-duration-90"));
    await waitFor(() => expect(state()).toBe("ready"));
    expect(screen.queryAllByTestId("wizard-slot").some((b) => b.getAttribute("aria-pressed") === "true")).toBe(false);
    expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(true);
    // Only starts that fit 90 minutes before 13:00.
    expect(startTimes()).not.toContain("12:00");
    expect(startTimes()).toContain("11:30");

    fireEvent.click(slotButton("10:00"));
    fireEvent.click(screen.getByTestId("wizard-send"));
    await waitFor(() =>
      expect(requests.createClassRequest).toHaveBeenCalledWith(expect.objectContaining({ startTime: "10:00", endTime: "11:30" }))
    );
  });
});

describe("a cleared weekly start date (rule 14a)", () => {
  it.each(["date", "count"] as const)("[CLASSES-CLASS-REQUESTS-55] a cleared weekly start date waits (%s ending)", async (ending) => {
    const { show } = renderPrivateStep("when");
    fireEvent.click(screen.getByTestId("wizard-recurrence-weekly"));
    fireEvent.click(screen.getByTestId("wizard-weekday-2"));
    fireEvent.click(screen.getByTestId(`request-end-mode-${ending}`));
    show("time");
    await waitFor(() => expect(state()).toBe("ready"));

    const calls = availabilityApi.getCoachAvailability.mock.calls.length;
    // The start date is cleared on step b, then step c is shown over that draft.
    show("when");
    expect(() => fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: "" } })).not.toThrow();
    expect(() => show("time")).not.toThrow();
    expect(state()).toBe("waiting");
    expect(startTimes()).toEqual([]);
    await new Promise((r) => setTimeout(r, 30));
    expect(availabilityApi.getCoachAvailability.mock.calls.length).toBe(calls);

    // A date again: the availability is read again for it.
    show("when");
    fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: soon } });
    await waitFor(() => expect(availabilityApi.getCoachAvailability).toHaveBeenCalledWith(expect.objectContaining({ from: soon })));
  });
});

describe("a repeated username (rule 12)", () => {
  it("[CLASSES-CLASS-REQUESTS-56] a repeated username is refused on the field", async () => {
    const { show } = renderPrivateStep("people");
    fireEvent.click(screen.getByTestId("wizard-people-3"));
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "carla" } });
    fireEvent.change(screen.getByTestId("wizard-invitee-1"), { target: { value: " Carla " } });
    await waitFor(() => expect(screen.getByTestId("wizard-invitee-0").getAttribute("data-state")).toBe("ok"), { timeout: 2000 });
    await waitFor(() => expect(screen.getByTestId("wizard-invitee-1").getAttribute("data-state")).toBe("DUPLICATE_INVITEE"));
    expect(screen.getByTestId("wizard-invitee-1-error").getAttribute("data-reason")).toBe("DUPLICATE_INVITEE");
    show("time");
    expect(state()).toBe("waiting");
    // The name is checked once, not twice.
    const asked = availabilityApi.getRequestParticipants.mock.calls.flatMap((c) => c[1] as string[]);
    expect(asked.map((n) => n.trim().toLowerCase())).toEqual(["carla"]);

    show("people");
    fireEvent.change(screen.getByTestId("wizard-invitee-1"), { target: { value: "dana" } });
    await waitFor(() => expect(screen.getByTestId("wizard-invitee-1").getAttribute("data-state")).toBe("ok"), { timeout: 2000 });
    show("time");
    await waitFor(() => expect(state()).toBe("ready"));
  });
});
