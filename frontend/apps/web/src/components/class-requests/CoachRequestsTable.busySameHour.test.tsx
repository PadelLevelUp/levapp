/**
 * classes.class-requests rule 4a (B-729), the coach's table: an accept refused `409 busy_same_hour` shows
 * the clash line, never `classRequests.refusal.busy_same_hour`, which no locale has. `t` returns the key.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoachRequestRow } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@levelup/api/src/resources/players", async (orig) => ({
  ...(await orig<typeof import("@levelup/api/src/resources/players")>()),
  getCoachPlayers: vi.fn().mockResolvedValue([]),
}));
const coachApi = vi.hoisted(() => ({ listCoachRequests: vi.fn() }));
vi.mock("@/api/coachRequests", () => coachApi);

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
  acceptClassRequest: vi.fn(),
  declineClassRequest: vi.fn(),
  proposeClassRequest: vi.fn(),
  classRequestRefusal: (err: { response?: { data?: { code?: string } } }) => err?.response?.data ?? null,
}));
vi.mock("@/api/classRequests", () => requestsApi);
vi.mock("@/api/classJoinRequests", () => ({
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  joinRequestRefusal: () => null,
  sideGoneOf: () => null,
}));

import { CoachRequestsTable } from "./CoachRequestsTable";

const REQUEST: CoachRequestRow = {
  kind: "private", id: 7, playerId: "bruno-id", playerName: "Bruno", nickname: null, nicknameAsName: false, displayName: "Bruno",
  coachId: "ana-id", date: "2026-11-16", startTime: "11:00", endTime: "12:00", classTitle: null, recurrence: null,
  createdAt: "2026-11-15T12:00:00+00:00", decidedAt: null, decidedBy: null, note: null, status: "pending", side: null,
  participants: [], lessonId: null, lessonInstanceId: null, suggestedProfileSide: null,
};

describe("a refused accept names the clash on the coach's table (classes.class-requests rule 4a, B-729)", () => {
  it("[CLASSES-CLASS-REQUESTS-41] shows the clash line when the accept is refused busy_same_hour", async () => {
    coachApi.listCoachRequests.mockResolvedValue({
      items: [REQUEST],
      pagination: { page: 1, perPage: 25, total: 1, pages: 1, hasNext: false, hasPrev: false },
      counts: { open: 1, history: 0 },
    });
    requestsApi.acceptClassRequest.mockRejectedValue(refused);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <CoachRequestsTable />
        </QueryClientProvider>
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByTestId("class-request-accept"));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const description = (toast.mock.calls.at(-1)?.[0] as { description?: unknown })?.description;
    expect(String(description)).toContain("calendar.busySameHour.line");
    expect(String(description)).not.toContain("classRequests.refusal.busy_same_hour");
  });
});
