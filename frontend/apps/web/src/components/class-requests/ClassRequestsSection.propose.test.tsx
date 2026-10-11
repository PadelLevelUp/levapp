/**
 * classes.class-requests rule 20 (PAD-491): in the coach's "propose another time" form, changing
 * the start moves the end so the form keeps its length; changing the end never moves the start.
 * The rule itself is unit-tested in @levelup/config (proposalAfterStartChange); this pins the
 * form's wiring, through what is sent. Asserted by test id and request payload, never by copy.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassRequest } from "@levelup/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
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

import { ClassRequestsSection } from "./ClassRequestsSection";

const PENDING: ClassRequest = {
  id: 7,
  playerId: "bruno-id",
  playerName: "Bruno",
  coachId: "ana-id",
  coachName: "Ana",
  date: "2026-10-07",
  startTime: "10:00",
  endTime: "11:00",
  note: null,
  status: "pending",
  decidedBy: null,
  decidedAt: null,
  lessonId: null,
  createdAt: "2026-10-06T12:00:00",
  participants: [],
  recurrence: null,
};

async function openProposalForm() {
  requestsApi.listClassRequests.mockResolvedValue([PENDING]);
  joinRequestsApi.listClassJoinRequests.mockResolvedValue([]);
  requestsApi.proposeClassRequest.mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ClassRequestsSection role="coach" />
      </QueryClientProvider>
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByTestId("class-request-propose"));
  await screen.findByTestId("class-request-proposal-form");
}

const sent = async () => {
  fireEvent.click(screen.getByTestId("class-request-propose-send"));
  await waitFor(() => expect(requestsApi.proposeClassRequest).toHaveBeenCalled());
  return requestsApi.proposeClassRequest.mock.calls[0][1];
};

// jsdom has no scrollIntoView; the section scrolls the row it opens into view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  Object.values(requestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
  Object.values(joinRequestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
});

describe("propose another time keeps the length (PAD-491, rule 20)", () => {
  it("moving the start moves the end by the request's length", async () => {
    await openProposalForm();
    fireEvent.change(screen.getByTestId("class-request-proposal-start"), { target: { value: "14:30" } });
    fireEvent.keyDown(screen.getByTestId("class-request-proposal-start"), { key: "Enter" }); // PAD-559 PR-2: the shared field commits on Enter
    expect(await sent()).toEqual({ date: "2026-10-07", startTime: "14:30", endTime: "15:30" });
  });

  it("after the coach sets the end, moving the start keeps the coach's length", async () => {
    await openProposalForm();
    fireEvent.change(screen.getByTestId("class-request-proposal-end"), { target: { value: "11:30" } });
    fireEvent.keyDown(screen.getByTestId("class-request-proposal-end"), { key: "Enter" }); // PAD-559 PR-2: the shared field commits on Enter
    fireEvent.change(screen.getByTestId("class-request-proposal-start"), { target: { value: "15:00" } });
    fireEvent.keyDown(screen.getByTestId("class-request-proposal-start"), { key: "Enter" }); // PAD-559 PR-2: the shared field commits on Enter
    expect(await sent()).toEqual({ date: "2026-10-07", startTime: "15:00", endTime: "16:30" });
  });

  it("changing the end never moves the start", async () => {
    await openProposalForm();
    fireEvent.change(screen.getByTestId("class-request-proposal-end"), { target: { value: "12:00" } });
    fireEvent.keyDown(screen.getByTestId("class-request-proposal-end"), { key: "Enter" }); // PAD-559 PR-2: the shared field commits on Enter
    expect(await sent()).toEqual({ date: "2026-10-07", startTime: "10:00", endTime: "12:00" });
  });
});
