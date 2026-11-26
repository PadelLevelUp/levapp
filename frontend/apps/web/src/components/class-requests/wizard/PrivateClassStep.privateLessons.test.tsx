/**
 * classes.class-requests rule 13b (PAD-929 C): when the private step's availability read succeeds and
 * leaves no start time, and the request has no invitees, the step lists the coach's visible private
 * lessons (`type=private`, classes.academy-class-booking rule 12) under today's message; each row's
 * one action goes through the private-lesson warning (classes.join-requests rule 22). Asserted by test id and call args,
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
const joinApi = vi.hoisted(() => ({ createClassJoinRequest: vi.fn(), joinClassWaitingList: vi.fn() }));
vi.mock("@/api/classJoinRequests", () => ({ createClassJoinRequest: joinApi.createClassJoinRequest }));
vi.mock("@/api/academyClasses", () => ({ joinClassWaitingList: joinApi.joinClassWaitingList }));

const availabilityApi = vi.hoisted(() => ({
  getRequestParticipants: vi.fn().mockResolvedValue([]),
  getCoachAvailability: vi.fn(),
}));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn() }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { PrivateAllSteps } from "./PrivateAllSteps.testing";

const NO_TIME = { freeWindows: {}, workingHoursSource: "custom" };

function lesson(id: string, state: "open" | "full", mine: { requestStatus?: string; waiting?: boolean } = {}) {
  return {
    id, model: "LessonInstance", originalId: id, date: "2026-11-20", startTime: "18:00", endTime: "19:30",
    title: `Private ${id}`, club: { name: "Douro Padel" }, classType: "private", state,
    spotsLeft: state === "open" ? 1 : 0, myJoinRequest: mine.requestStatus ? { id: Number(id), status: mine.requestStatus } : null,
    onWaitingList: mine.waiting ?? false,
  };
}

function renderStep() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PrivateAllSteps coachId="ana-id" onDone={vi.fn()} />
    </QueryClientProvider>
  );
}

async function emptyState() {
  await waitFor(() => expect(screen.getByTestId("wizard-slots").getAttribute("data-state")).toBe("empty"));
}

afterEach(() => {
  joinApi.createClassJoinRequest.mockReset();
  joinApi.joinClassWaitingList.mockReset();
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
    // Each row offers its one action: request when open, the waiting list when full.
    expect(open.querySelector('[data-testid="wizard-private-lesson-request"]')).toBeTruthy();
    expect(open.querySelector('[data-testid="wizard-private-lesson-waitlist"]')).toBeNull();
    const full = screen.getByTestId("wizard-private-lesson-row-full");
    expect(full.querySelector('[data-testid="wizard-private-lesson-waitlist"]')).toBeTruthy();
    expect(full.querySelector('[data-testid="wizard-private-lesson-request"]')).toBeNull();

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

describe("a list row joins through the warning (classes.join-requests rule 22)", () => {
  it("[CLASSES-JOIN-REQUESTS-43] a list row joins through the warning", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({ classes: [lesson("1", "open"), lesson("2", "full")] });
    joinApi.createClassJoinRequest.mockResolvedValue({ id: 9, status: "pending", side: "right" });
    joinApi.joinClassWaitingList.mockResolvedValue({ onWaitingList: true });
    renderStep();
    await emptyState();

    // Open row: NÃO sends nothing; SIM opens the side choice, and the request carries the confirmation.
    fireEvent.click(await screen.findByTestId("wizard-private-lesson-request"));
    expect(screen.getByTestId("private-lesson-warning")).toBeTruthy();
    fireEvent.click(screen.getByTestId("private-lesson-warning-no"));
    expect(joinApi.createClassJoinRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("private-lesson-warning")).toBeNull());
    fireEvent.click(screen.getByTestId("wizard-private-lesson-request"));
    fireEvent.click(screen.getByTestId("private-lesson-warning-yes"));
    fireEvent.click(await screen.findByTestId("class-side-right"));
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() =>
      expect(joinApi.createClassJoinRequest).toHaveBeenCalledWith(expect.objectContaining({ originalId: "1" }), undefined, "right", true),
    );

    // Full row: the waiting-list join goes through the same warning.
    await waitFor(() => expect(screen.queryByTestId("class-side-choice")).toBeNull());
    fireEvent.click(screen.getByTestId("wizard-private-lesson-waitlist"));
    fireEvent.click(screen.getByTestId("private-lesson-warning-yes"));
    fireEvent.click(await screen.findByTestId("class-side-left"));
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() =>
      expect(joinApi.joinClassWaitingList).toHaveBeenCalledWith(expect.objectContaining({ originalId: "2" }), "left", undefined, true),
    );
  });
});

describe("a row's action follows the student's request (rule 13b, academyClassAction)", () => {
  it("[CLASSES-CLASS-REQUESTS-46] a row's action follows the student's request", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue(NO_TIME);
    academyApi.listAcademyClasses.mockResolvedValue({
      classes: [
        lesson("1", "open", { requestStatus: "pending" }),
        lesson("2", "open", { requestStatus: "withdrawn" }),
        lesson("3", "open", { requestStatus: "rejected" }),
        lesson("4", "open"),
        lesson("5", "full", { waiting: true }),
      ],
    });
    renderStep();
    await emptyState();
    await screen.findByTestId("wizard-private-lessons");
    const row = (id: string) => document.querySelector(`[data-class-id="${id}"]`) as HTMLElement;
    const has = (id: string, testId: string) => !!row(id).querySelector(`[data-testid="${testId}"]`);

    expect(row("1").querySelector('[data-testid="wizard-private-lesson-status"]')?.textContent).toBe("classRequests.academy.requested");
    expect(has("1", "wizard-private-lesson-request")).toBe(false);
    for (const id of ["2", "3", "4"]) {
      expect(has(id, "wizard-private-lesson-request")).toBe(true);
      expect(has(id, "wizard-private-lesson-status")).toBe(false);
    }
    expect(row("5").querySelector('[data-testid="wizard-private-lesson-status"]')?.textContent).toBe("classRequests.academy.onWaitlist");
    expect(has("5", "wizard-private-lesson-waitlist")).toBe(false);
  });
});
