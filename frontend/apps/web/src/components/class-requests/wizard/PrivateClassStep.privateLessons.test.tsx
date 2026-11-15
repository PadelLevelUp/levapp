/**
 * classes.class-requests rule 13b (PAD-929 C): when the private step's availability read succeeds and
 * leaves no start time, and the request has no invitees, the step lists the coach's visible private
 * lessons (`type=private`, classes.academy-class-booking rule 12) under today's message. Rows only:
 * their actions come with the private-lesson warning (wave 3). Asserted by test id and call args,
 * never by rendered copy (`t` returns the key).
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
vi.mock("@/api/classRequests", () => ({ createClassRequest: vi.fn(), classRequestRefusal: () => null }));

const availabilityApi = vi.hoisted(() => ({
  getRequestParticipants: vi.fn().mockResolvedValue([]),
  getCoachAvailability: vi.fn(),
}));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn() }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { PrivateClassStep } from "./PrivateClassStep";

const NO_TIME = { freeWindows: {}, workingHoursSource: "custom" };

function lesson(id: string, state: "open" | "full") {
  return {
    id, model: "LessonInstance", originalId: id, date: "2026-11-20", startTime: "18:00", endTime: "19:30",
    title: `Private ${id}`, club: { name: "Douro Padel" }, classType: "private", state,
    spotsLeft: state === "open" ? 1 : 0, myJoinRequest: null, onWaitingList: false,
  };
}

function renderStep() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PrivateClassStep coachId="ana-id" onDone={vi.fn()} />
    </QueryClientProvider>
  );
}

async function emptyState() {
  await waitFor(() => expect(screen.getByTestId("wizard-slots").getAttribute("data-state")).toBe("empty"));
}

afterEach(() => {
  availabilityApi.getCoachAvailability.mockReset();
  availabilityApi.getRequestParticipants.mockReset().mockResolvedValue([]);
  academyApi.listAcademyClasses.mockReset();
});

describe("no free time offers the coach's visible private lessons (rule 13b)", () => {
  it("[CLASSES-CLASS-REQUESTS-45] no free time lists the coach's visible private lessons", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [lesson("1", "open"), lesson("2", "full")] });

    renderStep();
    await emptyState();
    expect(await screen.findByTestId("wizard-private-lessons")).toBeTruthy();
    expect(academyApi.listAcademyClasses).toHaveBeenCalledWith("ana-id", "private");
    const open = screen.getByTestId("wizard-private-lesson-row-open");
    expect(open.textContent).toContain("18:00–19:30");
    expect(open.textContent).toContain('classRequests.minutes:{"count":90}');
    expect(open.textContent).toContain("Douro Padel");
    expect(screen.getByTestId("wizard-private-lesson-row-full")).toBeTruthy();
    // Wave 2: rows only, no join action yet.
    expect(screen.queryByTestId("wizard-private-lesson-request")).toBeNull();
    expect(screen.queryByTestId("wizard-private-lesson-waitlist")).toBeNull();

    // Weekly too.
    fireEvent.click(screen.getByTestId("wizard-recurrence-weekly"));
    fireEvent.click(screen.getByTestId("wizard-weekday-2"));
    await emptyState();
    expect(await screen.findByTestId("wizard-private-lesson-row-full")).toBeTruthy();
  });

  it("[CLASSES-CLASS-REQUESTS-45] with no private lesson, only the message shows", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [] });
    renderStep();
    await emptyState();
    await waitFor(() => expect(academyApi.listAcademyClasses).toHaveBeenCalled());
    expect(screen.queryByTestId("wizard-private-lessons")).toBeNull();
    expect(screen.getByTestId("wizard-slots").textContent).toContain("classRequests.noFreeBlocks");
  });

  it("[CLASSES-CLASS-REQUESTS-45] a failed list read shows the message alone", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockRejectedValue(new Error("403"));
    renderStep();
    await emptyState();
    await waitFor(() => expect(academyApi.listAcademyClasses).toHaveBeenCalled());
    expect(screen.queryByTestId("wizard-private-lessons")).toBeNull();
    expect(screen.getByTestId("wizard-slots").textContent).toContain("classRequests.noFreeBlocks");
  });

  it("[CLASSES-CLASS-REQUESTS-45] never reads the private lessons while there are start times", async () => {
    availabilityApi.getCoachAvailability.mockImplementation(async ({ from }: { from: string }) => ({
      freeWindows: { [from]: [{ startTime: "18:00", endTime: "19:00" }] },
      workingHoursSource: "custom",
    }));
    renderStep();
    await waitFor(() => expect(screen.getByTestId("wizard-slots").getAttribute("data-state")).toBe("ready"));
    expect(academyApi.listAcademyClasses).not.toHaveBeenCalled();
  });

  it("[CLASSES-CLASS-REQUESTS-45] never reads them when the availability read failed", async () => {
    availabilityApi.getCoachAvailability.mockRejectedValue(new Error("400"));
    renderStep();
    await emptyState();
    // Give any query a chance to start.
    await new Promise((r) => setTimeout(r, 20));
    expect(academyApi.listAcademyClasses).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wizard-private-lessons")).toBeNull();
  });

  it("[CLASSES-CLASS-REQUESTS-45] never reads them for a request with invitees", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    availabilityApi.getRequestParticipants.mockResolvedValue([{ username: "carla", ok: true }]);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [lesson("1", "open")] });
    renderStep();
    // Alone, the student is offered the lesson; with Carla coming, the same empty answer is not.
    expect(await screen.findByTestId("wizard-private-lessons")).toBeTruthy();
    const readsAlone = academyApi.listAcademyClasses.mock.calls.length;
    fireEvent.click(screen.getByTestId("wizard-people-2"));
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "carla" } });
    await waitFor(
      () => expect(availabilityApi.getCoachAvailability).toHaveBeenCalledWith(expect.objectContaining({ participants: ["carla"] })),
      { timeout: 2000 },
    );
    await emptyState();
    expect(screen.queryByTestId("wizard-private-lessons")).toBeNull();
    expect(academyApi.listAcademyClasses.mock.calls.length).toBe(readsAlone);
  });
});
