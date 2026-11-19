/**
 * classes.class-requests rule 4a (B-729): an accept refused `409 busy_same_hour` shows the clash lines from
 * @levelup/config classRequestRefusalLines (the coach's line for the coach, the student's for the student),
 * never `classRequests.refusal.busy_same_hour`, which no locale has. The words themselves are pinned in
 * the helper's own test (CLASSES-CLASS-REQUESTS-40); here `t` returns the key, so the key is what shows.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassRequest } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const refused = {
  response: {
    status: 409,
    data: {
      code: "busy_same_hour",
      message: "busy same hour",
      clashes: [{ playerId: 7, playerName: "Ana", lessonInstanceId: 3, title: "Ana 11:00", start: "2026-11-16T11:00:00" }],
    },
  },
};

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
  classRequestRefusal: (err: { response?: { data?: { code?: string } } }) => err?.response?.data ?? null,
}));
vi.mock("@/api/classRequests", () => requestsApi);
vi.mock("@/api/classJoinRequests", () => ({
  listClassJoinRequests: vi.fn().mockResolvedValue([]),
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  withdrawClassJoinRequest: vi.fn(),
  createClassJoinRequest: vi.fn(),
  joinRequestRefusal: () => null,
}));

import { ClassRequestsSection } from "./ClassRequestsSection";

const REQUEST: ClassRequest = {
  id: 7, playerId: "bruno-id", playerName: "Bruno", coachId: "ana-id", coachName: "Ana", date: "2026-11-16",
  startTime: "11:00", endTime: "12:00", note: null, status: "pending", decidedBy: null, decidedAt: null,
  lessonId: null, createdAt: "2026-11-15T12:00:00", participants: [], recurrence: null,
};

function renderAs(role: "coach" | "student") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ClassRequestsSection role={role} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const description = () => (toast.mock.calls.at(-1)?.[0] as { description?: unknown })?.description;

describe("a refused accept names the clash (classes.class-requests rule 4a, B-729)", () => {
  it("[CLASSES-CLASS-REQUESTS-41] shows the clash line when the accept is refused busy_same_hour", async () => {
    requestsApi.listClassRequests.mockResolvedValue([REQUEST]);
    requestsApi.acceptClassRequest.mockRejectedValue(refused);
    renderAs("coach");
    fireEvent.click(await screen.findByTestId("class-request-accept"));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(description())).toContain("calendar.busySameHour.line");
    expect(String(description())).not.toContain("classRequests.refusal.busy_same_hour");

    toast.mockClear();
    requestsApi.listClassRequests.mockResolvedValue([{ ...REQUEST, id: 8, status: "countered" }]);
    requestsApi.answerClassRequestProposal.mockRejectedValue(refused);
    renderAs("student");
    fireEvent.click(await screen.findByTestId("class-request-accept-proposal"));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(String(description())).toContain("classRequests.busySameHour.studentLine");
  });

  it("[CLASSES-CLASS-REQUESTS-41] the chat bubble takes a refused accept's text from the same helper", () => {
    const bubble = readFileSync(resolve(__dirname, "../messages/MessageBubble.tsx"), "utf8");
    expect(bubble).toMatch(/classRequestRefusalLines\(err, studentAnswers \? "student" : "coach"/);
  });
});
