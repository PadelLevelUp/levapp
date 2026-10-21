/**
 * players.nickname rule 8 (PAD-660): the coach's class-request list prints their nickname for the
 * student, from a payload that carries only the real name. Asserted by id, never by copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassJoinRequestListRow, ClassRequest } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (id: string | number | null | undefined, real: string | null | undefined) =>
    String(id) === "jorge-id" ? "Jorge chato" : (real ?? ""),
}));

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
const joinApi = vi.hoisted(() => ({
  listClassJoinRequests: vi.fn(),
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  withdrawClassJoinRequest: vi.fn(),
  createClassJoinRequest: vi.fn(),
  joinRequestRefusal: () => null,
}));
vi.mock("@/api/classJoinRequests", () => joinApi);

import { ClassRequestsSection } from "./ClassRequestsSection";

const priv = (id: number, playerId: string, playerName: string): ClassRequest => ({
  id, playerId, playerName, coachId: "ana-id", coachName: "Ana", date: "2026-10-07", startTime: "09:00",
  endTime: "10:00", note: null, status: "pending", decidedBy: null, decidedAt: null, lessonId: null,
  createdAt: "2026-10-06T12:00:00", participants: [], recurrence: null,
});
const academy = (id: number, playerId: string, playerName: string): ClassJoinRequestListRow => ({
  id, lessonInstanceId: "50", playerId, playerName, coachId: "ana-id", status: "pending",
  createdAt: "2026-10-06T10:00:00", decidedAt: null, note: null, kind: "academy", classTitle: "Terça",
  date: "2026-10-06", startTime: "18:00", endTime: "19:00",
});

describe("ClassRequestsSection names the student the way the coach does", () => {
  it("prints the nickname on private and academy rows, the real name for an unnamed student", async () => {
    requestsApi.listClassRequests.mockResolvedValue([priv(1, "jorge-id", "Jorge Silva"), priv(2, "bruno-id", "Bruno")]);
    joinApi.listClassJoinRequests.mockResolvedValue([academy(100, "jorge-id", "Jorge Silva"), academy(101, "carla-id", "Carla")]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <ClassRequestsSection role="coach" />
        </QueryClientProvider>
      </MemoryRouter>
    );
    const rows = await screen.findAllByTestId(/^(class-request-row|class-join-list-row)$/);
    const text = (id: string) => rows.find((r) => r.getAttribute("data-request-id") === id)!.textContent;
    expect(text("1")).toContain("Jorge chato");
    expect(text("1")).not.toContain("Jorge Silva");
    expect(text("2")).toContain("Bruno");
    expect(text("100")).toContain("Jorge chato");
    expect(text("101")).toContain("Carla");
  });
});
