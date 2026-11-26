/**
 * players.nickname rule 8 (PAD-660): the coach's requests table prints the coach's nickname for the
 * student. The server resolves it into each row's `displayName` (classes.coach-requests-table
 * rule 1), so the table prints that and never the real name beside it. Asserted by id, never by copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoachRequestRow } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/api/src/resources/players", async (orig) => ({
  ...(await orig<typeof import("@levelup/api/src/resources/players")>()),
  getCoachPlayers: vi.fn().mockResolvedValue([]),
}));
const coachApi = vi.hoisted(() => ({ listCoachRequests: vi.fn() }));
vi.mock("@/api/coachRequests", () => coachApi);
vi.mock("@/api/classRequests", () => ({
  acceptClassRequest: vi.fn(), declineClassRequest: vi.fn(), proposeClassRequest: vi.fn(), classRequestRefusal: () => null,
}));
vi.mock("@/api/classJoinRequests", () => ({
  acceptClassJoinRequest: vi.fn(), rejectClassJoinRequest: vi.fn(), joinRequestRefusal: () => null, sideGoneOf: () => null,
}));

import { CoachRequestsTable } from "./CoachRequestsTable";

function coachRow(overrides: Partial<CoachRequestRow>): CoachRequestRow {
  return {
    kind: "private", id: 1, playerId: "bruno-id", playerName: "Bruno", nickname: null, nicknameAsName: false,
    displayName: "Bruno", coachId: "ana-id", date: "2026-10-07", startTime: "10:00", endTime: "11:00", classTitle: null,
    recurrence: null, createdAt: "2026-10-06T12:00:00+00:00", decidedAt: null, decidedBy: null, note: null,
    status: "pending", side: null, participants: [], lessonId: null, lessonInstanceId: null, suggestedProfileSide: null,
    ...overrides,
  };
}
const asPage = (items: CoachRequestRow[]) => ({
  items,
  pagination: { page: 1, perPage: 25, total: items.length, pages: 1, hasNext: false, hasPrev: false },
  counts: { open: items.length, history: 0 },
});

describe("CoachRequestsTable names the student the way the coach does", () => {
  it("prints the nickname on private and academy rows, the real name for an unnamed student", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      asPage([
        coachRow({ id: 1, playerId: "jorge-id", playerName: "Jorge Silva", nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato" }),
        coachRow({ id: 2, playerId: "bruno-id", playerName: "Bruno", displayName: "Bruno" }),
        coachRow({ kind: "academy", id: 100, playerId: "jorge-id", playerName: "Jorge Silva", nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato", classTitle: "Terça" }),
        coachRow({ kind: "academy", id: 101, playerId: "carla-id", playerName: "Carla", displayName: "Carla", classTitle: "Terça" }),
      ])
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <CoachRequestsTable />
        </QueryClientProvider>
      </MemoryRouter>
    );
    const rows = await screen.findAllByTestId("coach-request-row");
    const student = (kind: string, id: string) =>
      rows.find((r) => r.getAttribute("data-kind") === kind && r.getAttribute("data-request-id") === id)!.querySelector('[data-testid="coach-request-cell-student"]')!.textContent;
    expect(student("private", "1")).toBe("Jorge chato");
    expect(student("private", "2")).toBe("Bruno");
    expect(student("academy", "100")).toBe("Jorge chato");
    expect(student("academy", "101")).toBe("Carla");
    expect(rows.map((r) => r.textContent).join(" ")).not.toContain("Jorge Silva");
  });
});
