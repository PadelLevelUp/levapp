/**
 * PAD-771 (calendar.event-detail rule 5's named exception): the coach's participants header counts
 * the filled spots, so a not-coming student frees theirs: 16 enrolled with 4 not coming reads
 * "12/16 · 4 vagas", not "16/16". Located by test id (R-013).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
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

function classOf(enrolled: number, absent: number) {
  const participants = Array.from({ length: enrolled }, (_, i) => ({ id: i + 1, name: `Case ${i + 1}` }));
  const presences = participants.slice(0, absent).map((p) => ({ id: p.id, playerId: p.id, status: "absent" }));
  return {
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences, participants, maxPlayers: 16,
  };
}

async function header(enrolled: number, absent: number) {
  api.getApprovalSuggestions.mockReset().mockResolvedValue({ state: "none" });
  api.getClassInstance.mockReset().mockResolvedValue(classOf(enrolled, absent));
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
  await waitFor(() => expect(screen.getByTestId("participants-enrolled")).toBeTruthy());
  return screen.getByTestId("participants-enrolled").textContent;
}

describe("the coach's participants header (PAD-771)", () => {
  it("counts a not-coming student's spot as open", async () => {
    const text = await header(16, 4);
    expect(text).toContain("12/16");
    expect(text).toContain("4");
    expect(text).not.toContain("16/16");
  });

  it("reads full when every spot is taken", async () => {
    expect(await header(16, 0)).toContain("16/16");
  });
});
