/**
 * players.list rules 5, 15 (PAD-834): the roster's two alerts are its filters, and each row
 * shows the pending and needs-configuring cues. Pending is `pendingRegistration`, never
 * `!validated`: a Google/Apple student has no password and is registered.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ isMobile: false }));

// Today is 2026-11-19 in these tests (see beforeEach); "Ghost" was added the same club day.
const LEVEL = { id: "L1", coachId: "1", code: "B1", label: "Beginner", displayOrder: 1 };
const PLAYERS = [
  {
    id: "cp-1", coachId: "1", playerId: "1", userId: "10",
    name: "Ghost Placeholder", email: "", isActive: false, validated: false,
    username: "pending-1", levelId: "L1", side: "left" as const, level: LEVEL, due: false,
    pendingRegistration: true, addedAt: "2026-11-19T08:00:00+00:00",
  },
  {
    id: "cp-2", coachId: "1", playerId: "2", userId: "20",
    name: "Google Student", email: "g@example.com", isActive: true, validated: false,
    username: "google", levelId: "L1", side: "right" as const, level: LEVEL, due: false,
    pendingRegistration: false, addedAt: "2026-10-01T08:00:00+00:00",
  },
  {
    id: "cp-3", coachId: "1", playerId: "3", userId: "30",
    name: "Tiago Unset", email: "t@example.com", isActive: true, validated: true,
    username: "tiago", levelId: null, side: null, level: null, due: false,
    pendingRegistration: false, addedAt: "2026-10-01T08:00:00+00:00",
  },
];

const LEVELS = [LEVEL];

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
const PAGE = {
  items: PLAYERS,
  pagination: { page: 1, perPage: 25, total: PLAYERS.length, pages: 1, hasNext: false, hasPrev: false },
  alerts: { missingLevel: 1, missingSide: 1, incomplete: 1, pendingRegistration: 1 },
};

vi.mock("@levelup/api/src/resources/players", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@levelup/api/src/resources/players")>();
  return {
    ...actual,
    getCoachPlayersPaginated: vi.fn(async () => PAGE),
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  vi.mocked(getCoachPlayersPaginated).mockClear();
});

import PlayersPage from "./PlayersPage";
import { getCoachPlayersPaginated } from "@levelup/api/src/resources/players";

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/players/:playerId" element={<PlayersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// getCoachPlayersPaginated(page, perPage, search, sortBy, sortDir, missingLevel, missingSide, incomplete, pending)
const lastCall = () => vi.mocked(getCoachPlayersPaginated).mock.calls.at(-1) ?? [];

describe("PlayersPage row states and alert filters (PAD-834)", () => {
  it("[PLAYERS-LIST-19] pending avatar, age label, chips and alert tones; a social student is not pending", async () => {
    renderAt("/players");

    const ghost = await screen.findByTestId("player-card-1");
    expect(ghost).toHaveAttribute("data-pending", "true");
    expect(ghost.querySelector('[data-testid="player-row-avatar-pending"]')).not.toBeNull();
    expect(ghost.querySelector('[data-testid="pending-registration-badge"]')?.textContent).toBe(
      "players.card.pendingToday",
    );

    const google = screen.getByTestId("player-card-2");
    expect(google).toHaveAttribute("data-pending", "false");
    expect(google.className).not.toContain("opacity-60");
    expect(google.querySelector('[data-testid="pending-registration-badge"]')).toBeNull();
    expect(google.querySelector('[data-testid="player-row-avatar-pending"]')).toBeNull();

    const tiago = screen.getByTestId("player-card-3");
    expect(tiago.querySelector('[data-testid="player-row-no-level"]')).not.toBeNull();
    expect(tiago.querySelector('[data-testid="player-row-no-side"]')).not.toBeNull();
    expect(ghost.querySelector('[data-testid="player-row-no-level"]')).toBeNull();

    expect(screen.getByTestId("players-alert-incomplete")).toHaveAttribute("data-tone", "warning");
    expect(screen.getByTestId("players-alert-pending")).toHaveAttribute("data-tone", "pending");
  });

  it("[PLAYERS-LIST-16] the two alerts filter, exclude each other, and \"Ver todos\" clears", async () => {
    renderAt("/players");
    fireEvent.click(await screen.findByTestId("players-alert-pending"));
    await waitFor(() => expect(lastCall()[8]).toBe(true));
    expect(lastCall()[7]).toBe(false);
    expect(lastSearch).toContain("pending=true");
    expect(screen.getByTestId("players-filter-clear")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("players-alert-incomplete"));
    await waitFor(() => expect(lastCall()[7]).toBe(true));
    expect(lastCall()[8]).toBe(false);
    expect(lastSearch).toContain("incomplete=true");
    expect(lastSearch).not.toContain("pending=");

    fireEvent.click(screen.getByTestId("players-filter-clear"));
    await waitFor(() => expect(lastCall()[7]).toBe(false));
    expect(lastCall()[8]).toBe(false);
    expect(screen.queryByTestId("players-filter-clear")).not.toBeInTheDocument();
  });

  it("a URL with two filters keeps the first of pending, incomplete, missing_level, missing_side", async () => {
    renderAt("/players?missing_side=true&incomplete=true");
    await screen.findByTestId("player-card-1");
    expect(lastCall()[7]).toBe(true);
    expect(lastCall()[6]).toBe(false);
  });
});
