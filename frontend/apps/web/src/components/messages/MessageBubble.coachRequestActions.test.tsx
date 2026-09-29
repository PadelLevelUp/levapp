/**
 * classes.class-requests rule 10a and classes.join-requests rule 18
 * (PAD-461): the coach answers a brand new private request, or an academy
 * join-request ask, straight from its chat bubble — same shape as the
 * counter-proposal bubble (rule 10, PAD-281) and "Pedidos de Aula" (PAD-460).
 * Asserted by test id, never by rendered copy (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Message } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));

const classRequestsApi = vi.hoisted(() => ({
  listClassRequests: vi.fn(),
  acceptClassRequest: vi.fn(),
  declineClassRequest: vi.fn(),
  answerClassRequestProposal: vi.fn(),
  classRequestRefusal: () => null,
}));
vi.mock("@/api/classRequests", () => classRequestsApi);

const classJoinRequestsApi = vi.hoisted(() => ({
  listClassJoinRequests: vi.fn(),
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  joinRequestRefusal: (err: unknown) =>
    (err as { response?: { data?: unknown } })?.response?.data ?? null,
}));
vi.mock("@/api/classJoinRequests", () => classJoinRequestsApi);

import { MessageBubble } from "./MessageBubble";

const noop = () => undefined;

function renderBubble(message: Message, isMine: boolean, userId: number, participantName = "Bruno") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MessageBubble
          message={message}
          isMine={isMine}
          userId={userId}
          participantName={participantName}
          onReply={noop}
          onEdit={noop}
          onDelete={noop}
          onReaction={noop}
        />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function requestedMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "1",
    senderId: 2,
    content: "Bruno asked for 18:00–19:00",
    timestamp: "2026-10-06T12:00:00Z",
    isRead: true,
    metadata: {
      classRequest: {
        id: 55,
        status: "pending",
        kind: "requested",
        slot: { date: "2026-10-06", startTime: "18:00", endTime: "19:00" },
      },
    },
    ...overrides,
  };
}

function joinRequestAskMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "2",
    senderId: 3,
    content: "Carla asked to join Terça 18h",
    timestamp: "2026-10-06T10:00:00Z",
    isRead: true,
    metadata: {
      joinRequest: { id: 77, status: "pending" },
      lessonInstanceId: 50,
    },
    ...overrides,
  };
}

afterEach(() => {
  Object.values(classRequestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
  Object.values(classJoinRequestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
});

describe("the coach answers a brand new private request from its bubble (rule 10a, PAD-461)", () => {
  it("offers Accept / Decline / Propose while the request is live pending at that slot", async () => {
    classRequestsApi.listClassRequests.mockResolvedValue([
      { id: 55, status: "pending", date: "2026-10-06", startTime: "18:00", endTime: "19:00" },
    ]);

    renderBubble(requestedMessage(), /* isMine */ false, /* userId (the coach) */ 1);

    const actions = await screen.findByTestId("class-request-proposal-actions");
    expect(actions.getAttribute("data-state")).toBe("actions");
    expect(actions.getAttribute("data-request-id")).toBe("55");
    expect(screen.getByTestId("class-request-bubble-accept")).toBeTruthy();
    expect(screen.getByTestId("class-request-bubble-decline")).toBeTruthy();
    expect(screen.getByTestId("class-request-bubble-propose")).toBeTruthy();

    fireEvent.click(screen.getByTestId("class-request-bubble-accept"));
    await waitFor(() => expect(classRequestsApi.acceptClassRequest).toHaveBeenCalledWith(55, {
      date: "2026-10-06",
      startTime: "18:00",
      endTime: "19:00",
    }));
  });

  it("the student's own copy of the message never offers actions", async () => {
    classRequestsApi.listClassRequests.mockResolvedValue([
      { id: 55, status: "pending", date: "2026-10-06", startTime: "18:00", endTime: "19:00" },
    ]);

    renderBubble(requestedMessage(), /* isMine */ true, /* userId (the student) */ 2);

    const actions = await screen.findByTestId("class-request-proposal-actions");
    expect(actions.getAttribute("data-state")).toBe("waiting");
    expect(screen.queryByTestId("class-request-bubble-accept")).toBeNull();
    expect(screen.queryByTestId("class-request-bubble-decline")).toBeNull();
    expect(screen.queryByTestId("class-request-bubble-propose")).toBeNull();
  });
});

describe("the coach answers an academy join-request ask from its bubble (rule 18, PAD-461)", () => {
  it("offers Accept / Decline while the request is live pending", async () => {
    classJoinRequestsApi.listClassJoinRequests.mockResolvedValue([
      { id: 77, status: "pending" },
    ]);

    renderBubble(joinRequestAskMessage(), /* isMine */ false, /* userId (the coach) */ 1, "Carla");

    const actions = await screen.findByTestId("join-request-bubble-actions");
    expect(actions.getAttribute("data-state")).toBe("actions");
    expect(actions.getAttribute("data-request-id")).toBe("77");
    expect(screen.getByTestId("join-request-bubble-accept")).toBeTruthy();
    expect(screen.getByTestId("join-request-bubble-decline")).toBeTruthy();
  });

  it("an ineligible 409 on accept opens the confirm dialog, and confirming accepts with confirm: true", async () => {
    classJoinRequestsApi.listClassJoinRequests.mockResolvedValue([
      { id: 77, status: "pending" },
    ]);
    classJoinRequestsApi.acceptClassJoinRequest
      .mockRejectedValueOnce({ response: { data: { code: "ineligible", ineligible: [{ playerId: 3, name: "Carla", failures: [] }] } } })
      .mockResolvedValueOnce({ id: 77, status: "accepted" });

    renderBubble(joinRequestAskMessage(), false, 1, "Carla");

    fireEvent.click(await screen.findByTestId("join-request-bubble-accept"));

    const confirmButton = await screen.findByTestId("eligibility-confirm-proceed");
    fireEvent.click(confirmButton);

    await waitFor(() => expect(classJoinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledWith(77, true));
    expect(classJoinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledTimes(2);
  });
});
