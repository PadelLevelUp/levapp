/**
 * classes.academy-class-booking rule 11 (PAD-504): the student's Availability request history
 * shows their waiting-list places beside private and academy requests. An active place offers
 * "leave", which asks once inline and then calls the leave endpoint for that class; every other
 * state is history with no action. Asserted by test id and `t` keys (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassWaitingListRow } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const requestsApi = vi.hoisted(() => ({
  listClassRequests: vi.fn(),
  listClassRequestCoaches: vi.fn(),
  getFreeBlocks: vi.fn(),
  acceptClassRequest: vi.fn(),
  declineClassRequest: vi.fn(),
  proposeClassRequest: vi.fn(),
  answerClassRequestProposal: vi.fn(),
  counterProposeClassRequest: vi.fn(),
  withdrawClassRequest: vi.fn(),
  classRequestRefusal: () => null,
}));
vi.mock("@/api/classRequests", () => requestsApi);

const joinRequestsApi = vi.hoisted(() => ({
  listClassJoinRequests: vi.fn(),
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  withdrawClassJoinRequest: vi.fn(),
  createClassJoinRequest: vi.fn(),
  joinRequestRefusal: () => null,
}));
vi.mock("@/api/classJoinRequests", () => joinRequestsApi);

const academyApi = vi.hoisted(() => ({
  listClassWaitingList: vi.fn(),
  leaveClassWaitingList: vi.fn(),
  joinClassWaitingList: vi.fn(),
  listAcademyClasses: vi.fn(),
}));
vi.mock("@/api/academyClasses", () => academyApi);

import { ClassRequestsSection } from "./ClassRequestsSection";

function waitingRow(overrides: Partial<ClassWaitingListRow>): ClassWaitingListRow {
  return {
    kind: "waiting_list",
    id: 7,
    lessonInstanceId: 70,
    classTitle: "Academia 5",
    date: "2026-10-09",
    startTime: "19:00",
    endTime: "20:00",
    coachName: "Ana",
    status: "active",
    joinedAt: "2026-10-02T09:00:00",
    createdAt: "2026-10-02T09:00:00",
    ...overrides,
  };
}

function renderSection(role: "coach" | "student") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ClassRequestsSection role={role} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("ClassRequestsSection — waiting lists (PAD-504)", () => {
  it("lists an active place with its state, class, coach and a leave button that asks once", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([]);
    academyApi.listClassWaitingList.mockResolvedValue([waitingRow({})]);
    academyApi.leaveClassWaitingList.mockResolvedValue({ lessonInstanceId: 70, onWaitingList: false });
    renderSection("student");

    const row = await screen.findByTestId("class-waiting-list-row");
    expect(row.getAttribute("data-status")).toBe("active");
    expect(within(row).getByText("Academia 5")).toBeTruthy();
    expect(within(row).getByTestId("class-waiting-list-status").textContent).toBe("classRequests.waitingList.status.active");
    expect(row.textContent).toContain('classRequests.waitingList.withCoach:{"name":"Ana"}');

    fireEvent.click(within(row).getByTestId("class-waiting-list-leave"));
    expect(academyApi.leaveClassWaitingList).not.toHaveBeenCalled(); // it asks first
    fireEvent.click(within(row).getByTestId("class-waiting-list-leave-yes"));
    await waitFor(() => expect(academyApi.leaveClassWaitingList).toHaveBeenCalledWith(70));
  });

  it("history places carry their state and no action", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([]);
    academyApi.listClassWaitingList.mockResolvedValue([
      waitingRow({ id: 1, lessonInstanceId: 11, status: "placed" }),
      waitingRow({ id: 2, lessonInstanceId: 12, status: "left" }),
    ]);
    renderSection("student");
    fireEvent.click(await screen.findByTestId("class-requests-history-toggle"));
    const rows = await screen.findAllByTestId("class-waiting-list-row");
    expect(rows.map((r) => r.getAttribute("data-status")).sort()).toEqual(["left", "placed"]);
    for (const r of rows) expect(within(r).queryByTestId("class-waiting-list-leave")).toBeNull();
  });

  it("a coach's section never asks for waiting lists", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([]);
    renderSection("coach");
    await screen.findByTestId("class-requests");
    expect(academyApi.listClassWaitingList).not.toHaveBeenCalled();
  });
});
