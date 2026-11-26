/**
 * classes.coach-requests-table rule 17 (PAD-795): below 768 px the web page shows cards, not a table,
 * with the table's fields, actions, tabs, pager and a collapsible "Filtrar/Ordenar" block that holds
 * a sort select. Asserted by test id and by what is sent; `t` returns the key.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const base: CoachRequestRow = {
  kind: "private", id: 1, playerId: "bruno-id", playerName: "Bruno Alves", nickname: null, nicknameAsName: false,
  displayName: "Bruno Alves", coachId: "ana-id", date: "2026-10-07", startTime: "09:00", endTime: "10:00", classTitle: null,
  recurrence: null, createdAt: "2026-10-06T23:30:00+00:00", decidedAt: null, decidedBy: null, note: "Prefiro de manhã",
  status: "pending", side: null, participants: [], lessonId: null, lessonInstanceId: null, suggestedProfileSide: null,
};
const rows: CoachRequestRow[] = [
  base,
  { ...base, kind: "academy", id: 100, playerId: "carla-id", playerName: "Carla Dias", displayName: "Carla Dias", classTitle: "Terça 18h", startTime: "18:00", endTime: "19:00", side: "left" },
];
const answer = { items: rows, pagination: { page: 1, perPage: 25, total: 2, pages: 1, hasNext: false, hasPrev: false }, counts: { open: 2, history: 5 } };

function narrow(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes("max-width: 767px"),
    media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  coachApi.listCoachRequests.mockReset();
  // jsdom has no matchMedia: put it back to that.
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function renderPage() {
  coachApi.listCoachRequests.mockResolvedValue(answer);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CoachRequestsTable />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
const lastQuery = () => coachApi.listCoachRequests.mock.calls.at(-1)?.[0];

describe("the narrow web layout (rule 17)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-22] below 768 px cards carry the table's fields, actions, sort and filters", async () => {
    narrow(true);
    renderPage();
    const cards = await screen.findAllByTestId("coach-request-row");
    expect(screen.queryByTestId("coach-requests-table")).toBeNull();
    expect(screen.getByTestId("coach-requests-cards")).toBeTruthy();
    expect(screen.getByTestId("coach-requests-tab-open").textContent).toContain("(2)");
    expect(screen.getByTestId("coach-requests-tab-history").textContent).toContain("(5)");

    const [priv, acad] = cards;
    const cell = (c: HTMLElement, name: string) => within(c).getByTestId(`coach-request-cell-${name}`).textContent;
    expect(cell(priv, "class-day")).toBe("07/10/2026");
    expect(cell(priv, "class-time")).toBe("09:00–10:00");
    expect(cell(priv, "requested-day")).toBe("07/10/2026"); // 23:30 UTC is 00:30 the next day in the club's zone
    expect(cell(priv, "requested-time")).toBe("00:30");
    expect(cell(priv, "student")).toBe("Bruno Alves");
    expect(cell(priv, "kind")).toContain("classRequests.table.kind.private");
    expect(cell(priv, "status")).toContain("classRequests.coachStatus.pending");
    expect(cell(acad, "kind")).toContain("Terça 18h");
    expect(cell(acad, "side")).toBe("players.sideLeft");
    // The actions, in the open on a card.
    for (const id of ["class-request-accept", "class-request-decline", "class-request-propose"]) expect(within(priv).getByTestId(id)).toBeTruthy();
    for (const id of ["class-join-list-accept", "class-join-list-reject"]) expect(within(acad).getByTestId(id)).toBeTruthy();

    // The filters and the sort are behind one toggle, with a sort select (the headers are gone).
    expect(screen.queryByTestId("coach-requests-sort-select")).toBeNull();
    fireEvent.click(screen.getByTestId("coach-requests-filters-toggle"));
    fireEvent.change(screen.getByTestId("coach-requests-sort-select"), { target: { value: "student" } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ sortBy: "student", sortDir: "asc", page: 1 }));
    fireEvent.change(screen.getByTestId("coach-requests-sort-dir"), { target: { value: "desc" } });
    fireEvent.change(screen.getByTestId("coach-requests-filter-kind"), { target: { value: "academy" } });
    await waitFor(() => expect(lastQuery()).toEqual({ section: "open", page: 1, sortBy: "student", sortDir: "desc", kind: "academy" }));

    // A card opens its detail.
    fireEvent.click(within(priv).getByTestId("coach-request-cell-student"));
    const detail = await screen.findByTestId("coach-request-detail");
    expect(within(detail).getByTestId("coach-request-detail-note").textContent).toContain("Prefiro de manhã");
    // The pager is the table's.
    expect(screen.getByTestId("coach-requests-pager-position").textContent).toBe("1 / 1");
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-22] at 768 px and above the table is back", async () => {
    narrow(false);
    renderPage();
    await screen.findAllByTestId("coach-request-row");
    expect(screen.getByTestId("coach-requests-table")).toBeTruthy();
    expect(screen.queryByTestId("coach-requests-cards")).toBeNull();
    expect(screen.queryByTestId("coach-requests-filters-toggle")).toBeNull();
  });
});
