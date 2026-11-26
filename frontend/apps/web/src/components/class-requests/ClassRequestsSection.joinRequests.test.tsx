/**
 * classes.join-requests rule 17 (PAD-460): the student's Availability list shows academy join
 * requests beside the private ClassRequest rows, merged newest first; she may withdraw her own
 * pending academy row. The coach's side is the table's (CoachRequestsTable.joinRequests.test.tsx).
 * Asserted by test id, never by rendered copy (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassJoinRequestListRow, ClassRequest } from "@levelup/types";

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
  joinRequestRefusal: (err: unknown) =>
    (err as { response?: { data?: unknown } })?.response?.data ?? null,
  sideGoneOf: (r: { reasons?: string[]; requestedSide?: string } | null) =>
    r?.reasons?.includes("side") ? r.requestedSide : null,
}));
vi.mock("@/api/classJoinRequests", () => joinRequestsApi);
// The coach's endpoint, mocked where it is defined: whichever path the section reads it by, a call lands here.
const coachApi = vi.hoisted(() => ({ listCoachRequests: vi.fn() }));
vi.mock("@levelup/api/src/resources/coachRequests", async (orig) => ({
  ...(await orig<typeof import("@levelup/api/src/resources/coachRequests")>()),
  listCoachRequests: coachApi.listCoachRequests,
}));
const academyApi = vi.hoisted(() => ({ listClassWaitingList: vi.fn(), leaveClassWaitingList: vi.fn() }));
vi.mock("@/api/academyClasses", () => academyApi);

import { ClassRequestsSection } from "./ClassRequestsSection";

function privateRow(overrides: Partial<ClassRequest>): ClassRequest {
  return {
    id: 1,
    playerId: "bruno-id",
    playerName: "Bruno",
    coachId: "ana-id",
    coachName: "Ana",
    date: "2026-10-07",
    startTime: "09:00",
    endTime: "10:00",
    note: null,
    status: "pending",
    decidedBy: null,
    decidedAt: null,
    lessonId: null,
    createdAt: "2026-10-06T12:00:00",
    participants: [],
    recurrence: null,
    ...overrides,
  };
}

function academyRow(overrides: Partial<ClassJoinRequestListRow>): ClassJoinRequestListRow {
  return {
    id: 100,
    lessonInstanceId: "50",
    playerId: "carla-id",
    playerName: "Carla",
    coachId: "ana-id",
    status: "pending",
    createdAt: "2026-10-06T10:00:00",
    decidedAt: null,
    note: null,
    kind: "academy",
    classTitle: "Terça 18h",
    date: "2026-10-06",
    startTime: "18:00",
    endTime: "19:00",
    ...overrides,
  };
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ClassRequestsSection />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  coachApi.listCoachRequests.mockReset();
  Object.values(academyApi).forEach((fn) => fn.mockReset());
  Object.values(requestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
  Object.values(joinRequestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
});

describe("the student's list shows and lets her withdraw her own academy request (rule 17)", () => {
  it("[CLASSES-JOIN-REQUESTS-17] shows withdraw on her pending academy row and calls withdrawClassJoinRequest on click", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([academyRow({ id: 100 })]);
    joinRequestsApi.withdrawClassJoinRequest.mockResolvedValue(academyRow({ id: 100, status: "withdrawn" }));

    renderSection();
    fireEvent.click(await screen.findByTestId("class-join-list-withdraw"));

    await waitFor(() => expect(joinRequestsApi.withdrawClassJoinRequest).toHaveBeenCalledWith(100));
  });
});

describe("the student's list is untouched by the coach's table (classes.coach-requests-table, PAD-795)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-20] the student's list keeps the old reads", async () => {
    // A pending private request, a decided academy request and a waiting-list place (newest first).
    requestsApi.listClassRequests.mockResolvedValue([privateRow({ id: 1, createdAt: "2026-10-06T12:00:00" })]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([academyRow({ id: 100, status: "accepted", createdAt: "2026-10-06T10:00:00" })]);
    academyApi.listClassWaitingList.mockResolvedValue([
      { kind: "waiting_list", id: 5, lessonInstanceId: 70, classTitle: "Quinta", date: "2026-10-08", startTime: "18:00", endTime: "19:00",
        coachName: "Ana", status: "active", joinedAt: "2026-10-06T11:00:00", createdAt: "2026-10-06T11:00:00" },
    ]);

    renderSection();

    const all = await screen.findAllByTestId(/^(class-request-row|class-join-list-row|class-waiting-list-row)$/);
    // Merged newest first: the private request (12:00), the waiting-list place (11:00), the academy request (10:00).
    expect(all.map((el) => `${el.getAttribute("data-testid")}:${el.getAttribute("data-request-id") ?? el.getAttribute("data-instance-id")}`)).toEqual([
      "class-request-row:1",
      "class-waiting-list-row:70",
      "class-join-list-row:100",
    ]);
    // Em aberto holds the pending and the active place; the decided academy request is behind "Histórico".
    const history = screen.getByTestId("class-requests-history-toggle").closest("details")!;
    expect(history.contains(all[2])).toBe(true);
    expect(history.contains(all[0])).toBe(false);
    expect(history.contains(all[1])).toBe(false);
    expect(requestsApi.listClassRequests).toHaveBeenCalled();
    expect(joinRequestsApi.listClassJoinRequests).toHaveBeenCalled();
    expect(academyApi.listClassWaitingList).toHaveBeenCalled();
    expect(coachApi.listCoachRequests).not.toHaveBeenCalled();
  });
});
