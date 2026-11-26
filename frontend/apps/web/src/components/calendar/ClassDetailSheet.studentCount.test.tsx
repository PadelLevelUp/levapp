/**
 * calendar.event-detail rule 5 / CALENDAR-EVENT-DETAIL-49 (PO M-7384, M-7512): a student's class sheet shows the class's filled-spots count
 * (the payload's `participantCount`, the same number the calendar card shows), not a recount of the one
 * participant row a student receives. Located by test id and numbers, never by copy (R-013).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["student"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({ getApprovalState: vi.fn(), getClassInstance: vi.fn() }));
vi.mock("@/api/notificationEngine", async (orig) => ({ ...(await orig<Record<string, unknown>>()), getApprovalState: api.getApprovalState }));
vi.mock("@/api/classes", async (orig) => ({ ...(await orig<Record<string, unknown>>()), getClassInstance: api.getClassInstance }));

import { ClassDetailSheet } from "./ClassDetailSheet";

const event = {
  model: "LessonInstance", originalId: 7, id: "class-7-2099-10-19", type: "class", isRecurring: false, title: "Class",
  date: "2099-10-19", startTime: "09:00", endTime: "10:30", color: "#1355DC", openSpot: false,
  maxPlayers: 4, participantCount: 2, // the card says 2/4
} as unknown as CalendarEvent;

const me = { playerId: "1", name: "Eu Aluno" };
const payload = (extra: Record<string, unknown>) => ({
  id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled", maxPlayers: 4, name: "Aula",
  participants: [me], presences: [{ playerId: "1", status: "present", attendanceState: "coming" }], ...extra,
});

async function sheet(instance: Record<string, unknown>, canManage = false) {
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getClassInstance.mockReset().mockResolvedValue(instance);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ClassDetailSheet event={event} open onClose={() => undefined} players={[]} levels={[]} canManage={canManage} onDelete={() => undefined} onEdit={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getByTestId("class-detail-title")).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId("class-open-spots")).toBeTruthy());
  return document.body.textContent ?? "";
}

describe("a student's sheet count equals the card's", () => {
  it("[CALENDAR-EVENT-DETAIL-49] shows 2/4 and 2 open from the payload's participantCount, not 1/4 and 3 open", async () => {
    const text = await sheet(payload({ participantCount: 2 }));
    expect(text).toMatch(/2\/4/);
    expect(text).not.toMatch(/1\/4/);
    expect(screen.getByTestId("class-open-spots").textContent).toMatch(/2/);
  });

  it("[CALENDAR-EVENT-DETAIL-49] an older server (no participantCount) keeps today's count", async () => {
    const text = await sheet(payload({}));
    expect(text).toMatch(/1\/4/);
  });
});
