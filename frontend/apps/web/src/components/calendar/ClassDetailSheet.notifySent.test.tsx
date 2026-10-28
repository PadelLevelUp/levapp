/**
 * PAD-773: a batch the engine sends publishes `notify_sent`, and the open class re-reads its
 * invited list on it — only for this class; another class's batch leaves this list alone.
 * Located by test id (R-013).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

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

beforeEach(() => {
  live.handler = null;
  api.getApprovalSuggestions.mockReset().mockResolvedValue({ state: "none" });
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences: [], participants: [], maxPlayers: 16, invitations: [],
  });
});

async function openSheet() {
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
  await waitFor(() => expect(api.getClassInstance).toHaveBeenCalled());
  await waitFor(() => expect(live.handler).not.toBeNull());
  api.getClassInstance.mockClear();
}

const readIds = () => api.getClassInstance.mock.calls.map(([ev]) => Number((ev as { originalId: unknown }).originalId));

describe("notify_sent re-reads the open class only (PAD-773)", () => {
  it("a batch for this class re-reads its invited list", async () => {
    await openSheet();
    await act(async () => {
      live.handler!({ type: "notify_sent", payload: { lessonInstanceId: 7, count: 2, type: "auto" } });
    });
    await waitFor(() => expect(readIds()).toContain(7));
  });

  it("a batch for another class leaves this list alone", async () => {
    await openSheet();
    await act(async () => {
      live.handler!({ type: "notify_sent", payload: { lessonInstanceId: 8, count: 2, type: "auto" } });
    });
    expect(readIds()).not.toContain(8);
  });
});
