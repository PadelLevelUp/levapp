/**
 * players.master-detail (PAD-410): `/players` and `/players/:playerId` render
 * the SAME `PlayersPage` component (the MessagesPage pattern) so the roster's
 * search/sort/page/filter state survives a selection change.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ isMobile: false }));

const PLAYERS = [
  {
    id: "cp-1", coachId: "1", playerId: "1", userId: "10",
    name: "Ana Silva", email: "ana@example.com", isActive: true, validated: true,
    username: "ana", levelId: "L1", side: "left" as const,
    level: { id: "L1", coachId: "1", code: "B1", label: "Beginner", displayOrder: 1 },
    due: false,
  },
  {
    id: "cp-2", coachId: "1", playerId: "2", userId: "20",
    name: "Bruno Costa", email: "bruno@example.com", isActive: true, validated: true,
    username: "bruno", levelId: "L2", side: "right" as const,
    level: { id: "L2", coachId: "1", code: "I1", label: "Intermediate", displayOrder: 2 },
    due: false,
  },
];

const LEVELS = [PLAYERS[0].level, PLAYERS[1].level];

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => state.isMobile,
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("@/components/layout/LayoutContext", () => ({
  useLayout: () => ({ setScrollMode: vi.fn() }),
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "10", coachId: "1", roles: ["coach"] } }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: "en" },
  }),
  // `@/i18n.ts` (pulled in transitively via `@/lib/dateLocale`) calls
  // `i18n.use(initReactI18next).init(...)` at module scope.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// The page reads its list and levels through the shared hooks (client.query-cache, PAD-586), which
// call the resource modules directly; the `@/api/*` shims below serve the detail pane and writes.
const pageOf = (items: typeof PLAYERS) => ({
  items,
  pagination: { page: 1, perPage: 25, total: items.length, pages: 1, hasNext: false, hasPrev: false },
  alerts: { missingLevel: 0, missingSide: 0 },
});

vi.mock("@levelup/api/src/resources/players", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@levelup/api/src/resources/players")>();
  return {
    ...actual,
    getCoachPlayersPaginated: vi.fn(async () => pageOf(PLAYERS)),
    getCoachPlayers: vi.fn(async () => PLAYERS),
  };
});

vi.mock("@levelup/api/src/resources/coachLevel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@levelup/api/src/resources/coachLevel")>();
  return { ...actual, getCoachLevels: vi.fn(async () => LEVELS) };
});

vi.mock("@/api/players", () => ({
  addPlayer: vi.fn(),
  getCoachPlayers: vi.fn(async () => PLAYERS),
  getPlayerProfile: vi.fn(async () => ({ playerId: "1", evaluations: [], strengths: [], weaknesses: [] })),
  addCoachNote: vi.fn(),
  deleteCoachNote: vi.fn(),
  editPlayer: vi.fn(),
  editPlayerInvalidFields: () => false,
  removePlayer: vi.fn(),
  getPlayerRemovalImpact: vi.fn(async () => ({ action: "disconnect", notes: 0, evaluations: 0 })),
  removePlayerErrorCode: () => null,
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));

vi.mock("@/api/coachLevel", () => ({
  getCoachLevels: vi.fn(async () => LEVELS),
}));

vi.mock("@/api/playerInvitations", () => ({
  createIncompletePlayer: vi.fn(),
}));

vi.mock("@/api/notificationEngine", () => ({
  getStandingWaitingList: vi.fn(async () => []),
  removeFromStandingWaitingList: vi.fn(),
}));

vi.mock("@levelup/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@levelup/hooks")>();
  return {
    ...actual,
    usePlayerEvaluations: () => ({ data: { lastEvaluatedOn: null }, isLoading: false, isError: false }),
    useEvaluationCompetencies: () => ({ data: undefined, isLoading: false, isError: false }),
    usePutEvaluationRecord: () => ({ mutateAsync: vi.fn() }),
    useDeleteEvaluationRecord: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

beforeEach(() => {
  state.isMobile = false;
});

import PlayersPage from "./PlayersPage";
import { removePlayer } from "@/api/players";
import { getCoachPlayersPaginated } from "@levelup/api/src/resources/players";

function renderAt(path: string) {
  // A fresh client per test, so cases never share cache.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:playerId" element={<PlayersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PlayersPage master-detail (PAD-410)", () => {
  it("(a) at /players on desktop shows the placeholder and selects no row", async () => {
    renderAt("/players");

    expect(await screen.findByTestId("player-detail-placeholder")).toBeInTheDocument();
    const card1 = await screen.findByTestId("player-card-1");
    const card2 = screen.getByTestId("player-card-2");
    expect(card1).not.toHaveAttribute("aria-current", "true");
    expect(card2).not.toHaveAttribute("aria-current", "true");
    expect(card1).toHaveAttribute("data-selected", "false");
  });

  it("(b) at /players/<id> the row carries aria-current and the pane renders that player", async () => {
    renderAt("/players/2");

    const card2 = await screen.findByTestId("player-card-2");
    expect(card2).toHaveAttribute("aria-current", "true");
    expect(card2).toHaveAttribute("data-selected", "true");
    expect(screen.queryByTestId("player-detail-placeholder")).not.toBeInTheDocument();

    // The pane loaded Bruno Costa's own detail, not a stub.
    expect(await screen.findByRole("heading", { name: "Bruno Costa" })).toBeInTheDocument();
    expect(screen.getByTestId("player-evaluations-action")).toBeInTheDocument();
  });

  it("(c) clicking another row changes the route and keeps the search input's value", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Ana Silva" });

    const search = screen.getByTestId("players-search-input") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Bru" } });
    expect(search.value).toBe("Bru");
    // Let the debounced search settle, then count the roster requests.
    await waitFor(() => expect(vi.mocked(getCoachPlayersPaginated).mock.calls.at(-1)?.[2]).toBe("Bru"));
    const listCallsBefore = vi.mocked(getCoachPlayersPaginated).mock.calls.length;

    fireEvent.click(screen.getByTestId("player-card-2"));

    expect(await screen.findByRole("heading", { name: "Bruno Costa" })).toBeInTheDocument();
    expect(screen.getByTestId("player-card-2")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("player-card-1")).not.toHaveAttribute("aria-current", "true");

    // Selecting another player never touched the roster's own state: the search is kept and
    // the list was not asked for again, so its page, sort and filter are exactly as they were.
    expect((screen.getByTestId("players-search-input") as HTMLInputElement).value).toBe("Bru");
    expect(vi.mocked(getCoachPlayersPaginated).mock.calls.length).toBe(listCallsBefore);
  });

  it("(e) the pane's action row has the screenshot's order", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Ana Silva" });

    const pane = screen.getByTestId("player-detail-pane");
    const wanted = [
      "player-attendance-link", "player-absences-link", "player-add-to-classes",
      "player-waiting-list", "player-evaluations-action", "player-remove",
    ];
    const seen: string[] = [];
    pane.querySelectorAll("[data-testid]").forEach((el) => {
      const id = el.getAttribute("data-testid")!;
      if (wanted.includes(id) && !seen.includes(id)) seen.push(id);
    });
    expect(seen).toEqual(wanted);
  });

  it("(f) removing the selected player returns to /players and refetches the list", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Ana Silva" });
    const listCallsBefore = vi.mocked(getCoachPlayersPaginated).mock.calls.length;

    fireEvent.click(screen.getAllByTestId("player-remove")[0]);
    fireEvent.click(await screen.findByTestId("player-remove-confirm"));

    expect(await screen.findByTestId("player-detail-placeholder")).toBeInTheDocument();
    await waitFor(() =>
      expect(vi.mocked(getCoachPlayersPaginated).mock.calls.length).toBeGreaterThan(listCallsBefore));
    expect(vi.mocked(removePlayer)).toHaveBeenCalled();
  });

  it("(d) on mobile, /players/<id> hides the list", async () => {
    state.isMobile = true;
    renderAt("/players/1");

    expect(await screen.findByRole("heading", { name: "Ana Silva" })).toBeInTheDocument();
    // The Messages pattern: the list pane stays mounted but carries `hidden`
    // (Tailwind's `display: none`, not a real DOM check in jsdom), while the
    // detail pane is the one shown full width.
    expect(screen.getByTestId("players-list-pane").className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByTestId("player-detail-pane").className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("(g) a stale response for an older search cannot overwrite the newer page", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Ana Silva" });

    type Page = ReturnType<typeof pageOf>;
    let resolveAn!: (v: Page) => void;
    let resolveAna!: (v: Page) => void;
    vi.mocked(getCoachPlayersPaginated)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveAn = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveAna = resolve; }));
    const searchArg = () => vi.mocked(getCoachPlayersPaginated).mock.calls.map((c) => c[2]);

    fireEvent.change(screen.getByTestId("players-search-input"), { target: { value: "an" } });
    await waitFor(() => expect(searchArg()).toContain("an"), { timeout: 3000 });
    fireEvent.change(screen.getByTestId("players-search-input"), { target: { value: "ana" } });
    await waitFor(() => expect(searchArg()).toContain("ana"), { timeout: 3000 });

    // The newer search answers first with Ana only; the older one answers last with Bruno only.
    resolveAna(pageOf([PLAYERS[0]]));
    await waitFor(() => expect(screen.queryByTestId("player-card-2")).not.toBeInTheDocument());
    resolveAn(pageOf([PLAYERS[1]]));

    await waitFor(() => expect(screen.getByTestId("player-card-1")).toBeInTheDocument());
    expect(screen.queryByTestId("player-card-2")).not.toBeInTheDocument();
  });

  it("(h) a roster fetch that fails after a successful page keeps the rows and shows the error toast", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Ana Silva" });
    expect(await screen.findByTestId("player-card-2")).toBeInTheDocument();
    toastSpy.mockClear();

    // The refetch after removing the selected player is the failing second call.
    vi.mocked(getCoachPlayersPaginated).mockImplementationOnce(async () => { throw new Error("offline"); });
    fireEvent.click(screen.getAllByTestId("player-remove")[0]);
    fireEvent.click(await screen.findByTestId("player-remove-confirm"));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "players.listLoadFailed" })));
    expect(screen.getByTestId("player-card-2")).toBeInTheDocument();
  });
});
