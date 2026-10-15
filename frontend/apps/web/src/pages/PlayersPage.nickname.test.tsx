/**
 * players.nickname (PAD-660): the coach's private nickname on the players list, the profile header
 * and the edit form.
 */import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ isMobile: false }));

const PLAYERS = [
  {
    id: "cp-1", coachId: "1", playerId: "1", userId: "10",
    name: "Jorge Silva", email: "jorge@example.com", isActive: true, validated: true,
    username: "jorge", levelId: "L1", side: "left" as const,
    level: { id: "L1", coachId: "1", code: "B1", label: "Beginner", displayOrder: 1 },
    due: false,
    nickname: "Jorge chato", nicknameAsName: true, displayName: "Jorge chato",
  },
  {
    id: "cp-2", coachId: "1", playerId: "2", userId: "20",
    name: "Bruno Costa", email: "bruno@example.com", isActive: true, validated: true,
    username: "bruno", levelId: "L2", side: "right" as const,
    level: { id: "L2", coachId: "1", code: "I1", label: "Intermediate", displayOrder: 2 },
    due: false,
    nickname: "Bru", nicknameAsName: false, displayName: "Bruno Costa",
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
import { editPlayer } from "@/api/players";
import { getCoachPlayersPaginated } from "@levelup/api/src/resources/players";

function renderAt(path: string) {
  // The app's QueryClientProvider: PlayersPage reads the roster through shared hooks (PAD-586) and
  // the public web origin (PAD-595) through it. A fresh client per test, so cases never share cache.
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

describe("PlayersPage nickname (PAD-660)", () => {
  it("the list shows displayName, never the nickname when the switch is off", async () => {
    renderAt("/players");
    expect(await screen.findByTestId("player-card-name-1")).toHaveTextContent("Jorge chato");
    expect(screen.getByTestId("player-card-name-2")).toHaveTextContent("Bruno Costa");
  });

  it("the profile shows the nickname with the real name under it while the switch is on", async () => {
    renderAt("/players/1");
    expect(await screen.findByRole("heading", { name: "Jorge chato" })).toBeInTheDocument();
    expect(screen.getByTestId("player-real-name")).toHaveTextContent("Jorge Silva");
  });

  it("the profile shows no real-name line when the switch is off", async () => {
    renderAt("/players/2");
    expect(await screen.findByRole("heading", { name: "Bruno Costa" })).toBeInTheDocument();
    expect(screen.queryByTestId("player-real-name")).not.toBeInTheDocument();
  });

  it("the edit form shows the field, the warning and the switch with the row's values", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Jorge chato" });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.edit/ })[0]);

    const input = (await screen.findByTestId("player-nickname")) as HTMLInputElement;
    expect(input.value).toBe("Jorge chato");
    expect(input.maxLength).toBe(60);
    expect(input).toHaveAttribute("placeholder", "players.nickname.placeholder");
    expect(screen.getByTestId("player-nickname-warning")).toHaveTextContent("players.nickname.warning");
    expect(screen.getByTestId("player-nickname-as-name")).toHaveAttribute("aria-checked", "true");
    // The Name input keeps editing the REAL name.
    expect((screen.getByPlaceholderText("players.playerNamePlaceholder") as HTMLInputElement).value).toBe("Jorge Silva");
  });

  it("saving sends only the nickname fields that changed, and the name stays the real one", async () => {
    vi.mocked(editPlayer).mockClear();
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Jorge chato" });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.edit/ })[0]);

    // Untouched nickname fields: nothing about the nickname is sent.
    fireEvent.click(screen.getAllByRole("button", { name: /common\.save/ })[0]);
    await waitFor(() => expect(editPlayer).toHaveBeenCalledTimes(1));
    const first = vi.mocked(editPlayer).mock.calls[0][1];
    expect(first.name).toBe("Jorge Silva");
    expect("nickname" in first).toBe(false);
    expect("nicknameAsName" in first).toBe(false);
  });

  it("saving a changed nickname and switch sends updates.nickname and updates.nicknameAsName", async () => {
    vi.mocked(editPlayer).mockClear();
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Jorge chato" });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.edit/ })[0]);

    fireEvent.change(await screen.findByTestId("player-nickname"), { target: { value: "  Jorge alto " } });
    fireEvent.click(screen.getByTestId("player-nickname-as-name"));
    fireEvent.click(screen.getAllByRole("button", { name: /common\.save/ })[0]);

    await waitFor(() => expect(editPlayer).toHaveBeenCalledTimes(1));
    const updates = vi.mocked(editPlayer).mock.calls[0][1];
    expect(updates.nickname).toBe("Jorge alto");
    expect(updates.nicknameAsName).toBe(false);
    expect(updates.name).toBe("Jorge Silva");
  });

  it("a blank nickname is sent as an empty string so the server clears it", async () => {
    vi.mocked(editPlayer).mockClear();
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Jorge chato" });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.edit/ })[0]);
    fireEvent.change(await screen.findByTestId("player-nickname"), { target: { value: "   " } });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.save/ })[0]);
    await waitFor(() => expect(editPlayer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(editPlayer).mock.calls[0][1].nickname).toBe("");
  });

  it("a nickname over 60 characters is refused client-side with the too-long message", async () => {
    vi.mocked(editPlayer).mockClear();
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Jorge chato" });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.edit/ })[0]);
    fireEvent.change(await screen.findByTestId("player-nickname"), { target: { value: "x".repeat(61) } });
    fireEvent.click(screen.getAllByRole("button", { name: /common\.save/ })[0]);
    expect(await screen.findByTestId("player-nickname-error")).toHaveTextContent("players.nickname.tooLong");
    expect(editPlayer).not.toHaveBeenCalled();
  });
});
