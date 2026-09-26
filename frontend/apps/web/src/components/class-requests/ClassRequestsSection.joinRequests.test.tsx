/**
 * classes.join-requests rule 17 (PAD-460): the coach's "Pedidos de Aula" and the
 * student's Availability list show academy join requests beside the private
 * ClassRequest rows — merged newest first, split into the same open/closed
 * sections. Accepting an academy row goes through the same ineligible → confirm
 * flow as the class sheet (rule 7); the student may withdraw her own pending
 * academy row. Asserted by test id, never by rendered copy (`t` returns the key).
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
}));
vi.mock("@/api/classJoinRequests", () => joinRequestsApi);

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

function renderSection(role: "coach" | "student") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ClassRequestsSection role={role} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  Object.values(requestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
  Object.values(joinRequestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
});

describe("the coach's list merges academy rows with private ones (rule 17)", () => {
  it("shows an academy row, newest-first, between two private rows, with the badge, class title and time", async () => {
    requestsApi.listClassRequests.mockResolvedValue([
      privateRow({ id: 1, createdAt: "2026-10-06T14:00:00" }),
      privateRow({ id: 2, createdAt: "2026-10-06T08:00:00" }),
    ]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([
      academyRow({ id: 100, createdAt: "2026-10-06T10:00:00" }),
    ]);

    renderSection("coach");

    const academy = await screen.findByTestId("class-join-list-row");
    expect(academy.getAttribute("data-kind")).toBe("academy");
    expect(academy.getAttribute("data-status")).toBe("pending");
    expect(academy.getAttribute("data-request-id")).toBe("100");
    expect(academy.textContent).toContain("Terça 18h");
    expect(academy.textContent).toContain("18:00");
    expect(academy.textContent).toContain("19:00");
    expect(screen.getByTestId("class-join-list-kind")).toBeTruthy();

    // Merged newest first: private-1 (14:00) > academy-100 (10:00) > private-2 (08:00).
    const rows = screen
      .getAllByTestId(/^(class-request-row|class-join-list-row)$/)
      .map((el) => el.getAttribute("data-request-id"));
    expect(rows).toEqual(["1", "100", "2"]);
  });

  it("accepting a pending academy row calls acceptClassJoinRequest", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([academyRow({ id: 100 })]);
    joinRequestsApi.acceptClassJoinRequest.mockResolvedValue(academyRow({ id: 100, status: "accepted" }));

    renderSection("coach");
    fireEvent.click(await screen.findByTestId("class-join-list-accept"));

    await waitFor(() => expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledWith(100, false));
  });

  it("an ineligible 409 opens the confirm dialog, and confirming accepts with confirm: true", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([academyRow({ id: 100 })]);
    joinRequestsApi.acceptClassJoinRequest
      .mockRejectedValueOnce({ response: { data: { code: "ineligible", ineligible: [{ playerId: 1, name: "Carla", failures: [] }] } } })
      .mockResolvedValueOnce(academyRow({ id: 100, status: "accepted" }));

    renderSection("coach");
    fireEvent.click(await screen.findByTestId("class-join-list-accept"));

    const confirmButton = await screen.findByTestId("eligibility-confirm-proceed");
    fireEvent.click(confirmButton);

    await waitFor(() => expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledWith(100, true));
    expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledTimes(2);
  });
});

describe("the student's list shows and lets her withdraw her own academy request (rule 17)", () => {
  it("shows withdraw on her pending academy row and calls withdrawClassJoinRequest on click", async () => {
    requestsApi.listClassRequests.mockResolvedValue([]);
    joinRequestsApi.listClassJoinRequests.mockResolvedValue([academyRow({ id: 100 })]);
    joinRequestsApi.withdrawClassJoinRequest.mockResolvedValue(academyRow({ id: 100, status: "withdrawn" }));

    renderSection("student");
    fireEvent.click(await screen.findByTestId("class-join-list-withdraw"));

    await waitFor(() => expect(joinRequestsApi.withdrawClassJoinRequest).toHaveBeenCalledWith(100));
  });
});
