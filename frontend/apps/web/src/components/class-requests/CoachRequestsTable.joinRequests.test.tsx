/**
 * classes.join-requests rule 17 (PAD-460), the coach's side, on the coach's requests table
 * (classes.coach-requests-table, PAD-795): academy requests sit beside the private ones, and accepting
 * an academy row goes through the same ineligible → confirm flow as the class sheet (rule 7).
 * Asserted by test id, never by rendered copy (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoachRequestRow } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
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
const joinRequestsApi = vi.hoisted(() => ({
  acceptClassJoinRequest: vi.fn(),
  rejectClassJoinRequest: vi.fn(),
  joinRequestRefusal: (err: unknown) =>
    (err as { response?: { data?: unknown } })?.response?.data ?? null,
  sideGoneOf: (r: { reasons?: string[]; requestedSide?: string } | null) =>
    r?.reasons?.includes("side") ? r.requestedSide : null,
}));
vi.mock("@/api/classJoinRequests", () => joinRequestsApi);

import { CoachRequestsTable } from "./CoachRequestsTable";

function privateRow(overrides: Partial<CoachRequestRow>): CoachRequestRow {
  return {
    kind: "private", id: 1, playerId: "bruno-id", playerName: "Bruno", nickname: null, nicknameAsName: false, displayName: "Bruno",
    coachId: "ana-id", date: "2026-10-07", startTime: "09:00", endTime: "10:00", classTitle: null, recurrence: null,
    createdAt: "2026-10-06T12:00:00+00:00", decidedAt: null, decidedBy: null, note: null, status: "pending", side: null,
    participants: [], lessonId: null, lessonInstanceId: null, suggestedProfileSide: null,
    ...overrides,
  };
}

function academyRow(overrides: Partial<CoachRequestRow>): CoachRequestRow {
  return privateRow({
    kind: "academy", id: 100, playerId: "carla-id", playerName: "Carla", displayName: "Carla", createdAt: "2026-10-06T10:00:00+00:00",
    classTitle: "Terça 18h", date: "2026-10-06", startTime: "18:00", endTime: "19:00", lessonInstanceId: "50", ...overrides,
  });
}

const asPage = (items: CoachRequestRow[]) => ({
  items,
  pagination: { page: 1, perPage: 25, total: items.length, pages: 1, hasNext: false, hasPrev: false },
  counts: { open: items.length, history: 0 },
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CoachRequestsTable />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  coachApi.listCoachRequests.mockReset();
  Object.values(joinRequestsApi).forEach((fn) => typeof fn === "function" && "mockReset" in fn && fn.mockReset());
});

describe("the coach's table shows academy rows beside private ones (rule 17)", () => {
  it("[CLASSES-JOIN-REQUESTS-15] shows an academy row beside two private rows under Em aberto, with the badge, class title and time", async () => {
    coachApi.listCoachRequests.mockResolvedValue(
      asPage([
        privateRow({ id: 1 }),
        academyRow({ id: 100 }),
        privateRow({ id: 2 }),
      ])
    );

    renderSection();

    const rows = await screen.findAllByTestId("coach-request-row");
    expect(rows.map((el) => el.getAttribute("data-request-id"))).toEqual(["1", "100", "2"]);
    const academy = rows[1];
    expect(academy.getAttribute("data-kind")).toBe("academy");
    expect(academy.getAttribute("data-status")).toBe("pending");
    expect(academy.textContent).toContain("Terça 18h");
    expect(academy.textContent).toContain("18:00");
    expect(academy.textContent).toContain("19:00");
    expect(academy.querySelector('[data-testid="class-join-list-kind"]')).toBeTruthy();
    expect(screen.getByTestId("coach-requests-tab-open").getAttribute("aria-selected")).toBe("true");
  });

  it("accepting a pending academy row calls acceptClassJoinRequest", async () => {
    coachApi.listCoachRequests.mockResolvedValue(asPage([academyRow({ id: 100 })]));
    joinRequestsApi.acceptClassJoinRequest.mockResolvedValue({});

    renderSection();
    fireEvent.click(await screen.findByTestId("class-join-list-accept"));

    await waitFor(() => expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledWith(100, false));
  });

  it("[CLASSES-JOIN-REQUESTS-11] an ineligible 409 opens the confirm dialog, and confirming accepts with confirm: true", async () => {
    coachApi.listCoachRequests.mockResolvedValue(asPage([academyRow({ id: 100 })]));
    joinRequestsApi.acceptClassJoinRequest
      .mockRejectedValueOnce({ response: { data: { code: "ineligible", ineligible: [{ playerId: 1, name: "Carla", failures: [] }] } } })
      .mockResolvedValueOnce({});

    renderSection();
    fireEvent.click(await screen.findByTestId("class-join-list-accept"));

    const confirmButton = await screen.findByTestId("eligibility-confirm-proceed");
    fireEvent.click(confirmButton);

    await waitFor(() => expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledWith(100, true));
    expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledTimes(2);
  });

  // PAD-808 (rule 7a): the side part of the same 409.
  it("[CLASSES-JOIN-REQUESTS-9] a side-only 409 asks about the other side's spot, naming the student, and confirming accepts", async () => {
    coachApi.listCoachRequests.mockResolvedValue(asPage([academyRow({ id: 100 })]));
    joinRequestsApi.acceptClassJoinRequest
      .mockRejectedValueOnce({ response: { data: { code: "ineligible", ineligible: [], reasons: ["side"], requestedSide: "left", openSides: ["right"] } } })
      .mockResolvedValueOnce({});

    renderSection();
    fireEvent.click(await screen.findByTestId("class-join-list-accept"));

    const dialog = await screen.findByTestId("eligibility-confirm");
    expect(dialog.textContent).toContain("calendar.eligibilityConfirm.sideTitle");
    expect(dialog.textContent).toContain("calendar.eligibilityConfirm.sideGoneLeft");
    expect(screen.queryByTestId("eligibility-confirm-side")).toBeNull();
    fireEvent.click(screen.getByTestId("eligibility-confirm-proceed"));

    await waitFor(() => expect(joinRequestsApi.acceptClassJoinRequest).toHaveBeenCalledWith(100, true));
  });

  it("[CLASSES-JOIN-REQUESTS-10] both parts come in one dialog: the bar's students and the side line", async () => {
    coachApi.listCoachRequests.mockResolvedValue(asPage([academyRow({ id: 100 })]));
    joinRequestsApi.acceptClassJoinRequest.mockRejectedValueOnce({
      response: { data: {
        code: "ineligible", ineligible: [{ playerId: 1, name: "Carla", failures: [] }],
        reasons: ["eligibility", "side"], requestedSide: "right", openSides: ["left"],
      } },
    });

    renderSection();
    fireEvent.click(await screen.findByTestId("class-join-list-accept"));

    const dialog = await screen.findByTestId("eligibility-confirm");
    expect(dialog.textContent).toContain("calendar.eligibilityConfirm.title");
    expect(screen.getAllByTestId("eligibility-confirm-student")).toHaveLength(1);
    expect(screen.getByTestId("eligibility-confirm-side").textContent).toContain("calendar.eligibilityConfirm.sideGoneRight");
  });
});
