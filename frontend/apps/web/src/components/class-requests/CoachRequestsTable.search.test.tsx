/**
 * classes.coach-requests-table rules 7, 11 and 17, criterion -23 (PAD-795b): the search box above the
 * table. It waits 200 ms after the last keystroke (players.search rule 10), sends `search`, goes back to
 * page 1 keeping the sort and the other filters, says "searching" while it waits and "nobody found" when
 * the settled answer is empty, and lives in the URL. Asserted by test id and by what is sent; `t`
 * returns the key.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CoachRequestRow } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, o?: { query?: string }) => (o?.query ? `${key}:${o.query}` : key), i18n: { language: "pt" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const coachApi = vi.hoisted(() => ({ listCoachRequests: vi.fn() }));
vi.mock("@/api/coachRequests", () => coachApi);
vi.mock("@/api/classRequests", () => ({
  acceptClassRequest: vi.fn(), declineClassRequest: vi.fn(), proposeClassRequest: vi.fn(), classRequestRefusal: () => null,
}));
vi.mock("@/api/classJoinRequests", () => ({
  acceptClassJoinRequest: vi.fn(), rejectClassJoinRequest: vi.fn(), joinRequestRefusal: () => null, sideGoneOf: () => null,
}));

import { CoachRequestsTable } from "./CoachRequestsTable";

const row: CoachRequestRow = {
  kind: "private", id: 1, playerId: "rita-id", playerName: "Rita Gomes", nickname: "Ritinha", nicknameAsName: false,
  displayName: "Rita Gomes", coachId: "ana-id", date: "2026-10-07", startTime: "09:00", endTime: "10:00", classTitle: null,
  recurrence: null, createdAt: "2026-10-06T10:30:00+00:00", decidedAt: null, decidedBy: null, note: null,
  status: "pending", side: null, participants: [], lessonId: null, lessonInstanceId: null, suggestedProfileSide: null,
};
const page = (items: CoachRequestRow[], pageNo = 1, pages = 1) => ({
  items,
  pagination: { page: pageNo, perPage: 25, total: items.length, pages, hasNext: pageNo < pages, hasPrev: pageNo > 1 },
  counts: { open: items.length, history: 0 },
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  coachApi.listCoachRequests.mockReset();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function renderAt(url: string, narrow = false) {
  if (narrow) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width: 767px"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>
        <CoachRequestsTable />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
const sent = () => coachApi.listCoachRequests.mock.calls.map((c) => c[0]);
const type = (text: string) => fireEvent.change(screen.getByTestId("coach-requests-search"), { target: { value: text } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("the search box (PAD-795b)", () => {
  it("[CLASSES-COACH-REQUESTS-TABLE-23] the search box debounces, resets the page and says when nobody matches", async () => {
    // Page 2 of Em aberto, sorted by student descending, kind private.
    coachApi.listCoachRequests.mockResolvedValue(page([row], 2, 3));
    renderAt("/?page=2&sort_by=student&sort_dir=desc&kind=private");
    await screen.findByTestId("coach-request-row");
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).not.toHaveProperty("search");
    expect(screen.queryByTestId("player-search-searching")).toBeNull();
    expect(screen.queryByTestId("player-search-empty")).toBeNull();

    // Typing letter by letter, faster than 200 ms apart: nothing is sent yet, and "searching" shows.
    coachApi.listCoachRequests.mockImplementation(async (q) => (q.search === "rit" ? page([]) : page([row], 1, 1)));
    for (const text of ["r", "ri", "rit"]) {
      type(text);
      await sleep(50);
    }
    expect(sent()).toHaveLength(1);
    expect(screen.getByTestId("player-search-searching")).toBeTruthy();
    expect(screen.getByTestId("coach-request-row")).toBeTruthy(); // the previous rows stay

    // One request, after the typing stopped: the text, page 1, the sort and the kind.
    await waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()[1]).toMatchObject({ search: "rit", page: 1, sortBy: "student", sortDir: "desc", kind: "private", section: "open" });

    // The settled answer is empty: the shared line, not the table's own.
    const empty = await screen.findByTestId("player-search-empty");
    expect(empty.textContent).toBe("players.search.noResults:rit");
    expect(screen.queryByTestId("coach-requests-empty")).toBeNull();
    expect(screen.queryByTestId("player-search-searching")).toBeNull();

    // The tab keeps the text and sends it with the other section.
    fireEvent.click(screen.getByTestId("coach-requests-tab-history"));
    await waitFor(() => expect(sent().at(-1)).toMatchObject({ section: "history", search: "rit", page: 1 }));
    expect((screen.getByTestId("coach-requests-search") as HTMLInputElement).value).toBe("rit");

    // "Limpar filtros" clears the box and the request.
    fireEvent.click(screen.getByTestId("coach-requests-clear"));
    await waitFor(() => expect(sent().at(-1)).not.toHaveProperty("search"));
    expect((screen.getByTestId("coach-requests-search") as HTMLInputElement).value).toBe("");
    await sleep(300);
    expect(sent().at(-1)).not.toHaveProperty("search"); // the cleared text did not come back
    expect(screen.queryByTestId("player-search-empty")).toBeNull();
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-23] a search in the URL fills the box and is sent; clearing the box drops it", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row]));
    renderAt("/?search=ritinha");
    await screen.findByTestId("coach-request-row");
    expect((screen.getByTestId("coach-requests-search") as HTMLInputElement).value).toBe("ritinha");
    expect(sent()[0]).toMatchObject({ search: "ritinha", page: 1 });
    type("");
    await waitFor(() => expect(sent().at(-1)).not.toHaveProperty("search"));
  });

  it("[CLASSES-COACH-REQUESTS-TABLE-23] below 768 px the box is the first control of the Filtrar block", async () => {
    coachApi.listCoachRequests.mockResolvedValue(page([row]));
    renderAt("/", true);
    await screen.findByTestId("coach-request-row");
    expect(screen.queryByTestId("coach-requests-search")).toBeNull(); // collapsed with the filters
    fireEvent.click(screen.getByTestId("coach-requests-filters-toggle"));
    const box = screen.getByTestId("coach-requests-search");
    const filters = screen.getByTestId("coach-requests-filters");
    const controls = Array.from(filters.querySelectorAll("input, select"));
    // The two sort selects of the narrow layout come first; the box opens the filters after them.
    expect(controls.slice(0, 3).map((c) => c.getAttribute("data-testid"))).toEqual(["coach-requests-sort-select", "coach-requests-sort-dir", "coach-requests-search"]);
    expect(controls.indexOf(box)).toBe(2);
    type("rit");
    await waitFor(() => expect(sent().at(-1)).toMatchObject({ search: "rit", page: 1 }));
  });
});
