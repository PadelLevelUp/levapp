/**
 * PAD-770 (semi-auto-approval rule 12b, B-692): the class's approval cards follow the class. When
 * a presence moves (a join accepted, a "Não vou"), the sheet reads the class again and its
 * suggestions with it: a spot that filled drops its card without reopening the class. A card the
 * coach just answered stays until closed. Located by test id (R-013). Students are cases 7-13.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ApprovalBundle, CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
const live = vi.hoisted(() => ({ handler: null as null | ((data: unknown) => void) }));
vi.mock("@/api/events", () => ({
  subscribeAppEvents: (_token: string, handler: (data: unknown) => void) => {
    live.handler = handler;
    return () => undefined;
  },
}));
const api = vi.hoisted(() => ({ getApprovalSuggestions: vi.fn(), getClassInstance: vi.fn() }));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalSuggestions: api.getApprovalSuggestions,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = {
  model: "LessonInstance",
  originalId: 7,
  id: "class-7-2099-10-19",
  type: "class",
  isRecurring: false,
  title: "Class",
  date: "2099-10-19",
  startTime: "09:00",
  endTime: "10:30",
  color: "#1355DC",
  openSpot: false,
} as unknown as CalendarEvent;

const bundle = (bundleId: string, vacancyId: number): ApprovalBundle => ({
  bundleId,
  lessonInstanceId: 7,
  windowOpenAt: null,
  responded: false,
  vacancies: [{ vacancyId, declinedPlayerId: vacancyId, declinedPlayerName: `Case ${vacancyId}`, queue: [] }],
});

const cls = () => ({
  id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
  presences: [], participants: [], maxPlayers: 16,
});

function renderSheet() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet
          event={event}
          open
          onClose={() => undefined}
          players={[]}
          levels={[]}
          canManage
          onDelete={() => undefined}
          onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// What the server answers now; a test changes it when the class changes.
const server: { answer: unknown } = { answer: { state: "none", semiAutomatic: true } };

const cardIds = () =>
  screen.queryAllByTestId("replacement-approval-card").map((el) => el.getAttribute("data-bundle-id"));

beforeEach(() => {
  live.handler = null;
  api.getClassInstance.mockReset().mockImplementation(async () => cls());
  api.getApprovalSuggestions.mockReset().mockImplementation(async () => server.answer);
});

describe("the class's approval cards follow the class (PAD-770)", () => {
  it("a spot filled by a join drops its card when the presence moves, without reopening", async () => {
    server.answer = { state: "pending", bundles: [bundle("b-7", 7), bundle("b-8", 8)], semiAutomatic: true };
    renderSheet();
    await waitFor(() => expect(cardIds()).toEqual(["b-7", "b-8"]));
    await waitFor(() => expect(live.handler).not.toBeNull());

    // Case 9's request to join is accepted and fills case 7's spot.
    server.answer = { state: "pending", bundles: [bundle("b-8", 8)], semiAutomatic: true };
    await act(async () => {
      live.handler!({ type: "presence_changed", payload: { lessonInstanceId: 7 } });
    });

    await waitFor(() => expect(cardIds()).toEqual(["b-8"]));
  });

  it("the last card goes when nothing is pending any more", async () => {
    server.answer = { state: "pending", bundles: [bundle("b-7", 7)], semiAutomatic: true };
    renderSheet();
    await waitFor(() => expect(cardIds()).toEqual(["b-7"]));
    await waitFor(() => expect(live.handler).not.toBeNull());

    server.answer = { state: "none", semiAutomatic: true };
    await act(async () => {
      live.handler!({ type: "presence_changed", payload: { lessonInstanceId: 7 } });
    });

    await waitFor(() => expect(cardIds()).toEqual([]));
  });
});
