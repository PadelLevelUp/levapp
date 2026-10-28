/**
 * PAD-765 (semi-auto-approval rule 12): the class shows every pending approval prompt, one card per
 * bundle, oldest spot first; an older server's single `bundle` still shows. Located by test id
 * (R-013). Students are cases 7-13.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ApprovalBundle, CalendarEvent } from "@levelup/types";

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

const bundle = (bundleId: string, vacancyId: number, name: string): ApprovalBundle => ({
  bundleId,
  lessonInstanceId: 7,
  windowOpenAt: null,
  responded: false,
  vacancies: [{ vacancyId, declinedPlayerId: vacancyId, declinedPlayerName: name, queue: [] }],
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

async function cardIds() {
  await waitFor(() => expect(screen.queryAllByTestId("replacement-approval-card").length).toBeGreaterThan(0));
  return screen.getAllByTestId("replacement-approval-card").map((el) => el.getAttribute("data-bundle-id"));
}

beforeEach(() => {
  api.getApprovalSuggestions.mockReset();
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences: [], participants: [], maxPlayers: 16,
  });
});

describe("ClassDetailSheet — every pending approval prompt (PAD-765)", () => {
  it("shows one card per pending bundle, oldest spot first", async () => {
    const older = bundle("b-14", 1, "Case 7");
    const newer = bundle("b-21", 2, "Case 8");
    api.getApprovalSuggestions.mockResolvedValue({ state: "pending", bundle: older, bundles: [older, newer] });
    renderSheet();
    expect(await cardIds()).toEqual(["b-14", "b-21"]);
  });

  it("an older server's single bundle still shows", async () => {
    api.getApprovalSuggestions.mockResolvedValue({ state: "pending", bundle: bundle("b-21", 2, "Case 8") });
    renderSheet();
    expect(await cardIds()).toEqual(["b-21"]);
  });
});
