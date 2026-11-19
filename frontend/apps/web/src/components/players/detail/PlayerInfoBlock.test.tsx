/**
 * players.profile rule 8 (PAD-834): Block 1 (Informação) edits on its own, sends only what
 * changed, and blocks Guardar on an empty required select only in the "Completar informação"
 * session. Rendered through the real detail pane, with the roster and API mocked.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const LEVEL = { id: "L1", coachId: "1", code: "I1", label: "Iniciação", displayOrder: 1 };
const RUI = {
  id: "cp-1", coachId: "1", playerId: "1", userId: "10",
  name: "Rui Registered", email: "rui@example.pt", phone: "912000000", isActive: true, validated: true,
  username: "rui", levelId: "L1", side: "left" as const, level: LEVEL, due: false, notes: "",
  pendingRegistration: false, addedAt: "2026-10-01T08:00:00+00:00",
};
const TIAGO = {
  ...RUI, id: "cp-2", playerId: "2", userId: "20", name: "Tiago NoLevel", username: "tiago",
  levelId: undefined, level: undefined,
};
const PLAYERS = [RUI, TIAGO];
const LEVELS = [LEVEL];

const state = vi.hoisted(() => ({ isMobile: false, players: [] as unknown[], levels: [] as unknown[] }));

// Radix Select does not open in jsdom: a plain stand-in that keeps the trigger's test id and lets a
// test pick an option by its text (the EligibilitySection pattern).
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type Ctx = { value?: string; onValueChange?: (v: string) => void };
  const SelectCtx = React.createContext<Ctx>({});
  return {
    Select: ({ value, onValueChange, children }: Ctx & { children: React.ReactNode }) => (
      <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({ "data-testid": testId, children }: { "data-testid"?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(SelectCtx);
      return <div data-testid={testId} data-value={ctx.value}>{children}</div>;
    },
    SelectValue: () => <span>{React.useContext(SelectCtx).value}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(SelectCtx);
      return <button type="button" data-option={value} onClick={() => ctx.onValueChange?.(value)}>{children}</button>;
    },
  };
});
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
  alerts: { missingLevel: 0, missingSide: 0, incomplete: 0, pendingRegistration: 0 },
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
  getCoachPlayers: vi.fn(async () => state.players),
  getPlayerProfile: vi.fn(async () => ({ playerId: "1", evaluations: [], strengths: [], weaknesses: [] })),
  addCoachNote: vi.fn(),
  deleteCoachNote: vi.fn(),
  editPlayer: vi.fn(async () => ({})),
  editPlayerInvalidFields: () => false,
  removePlayer: vi.fn(),
  getPlayerRemovalImpact: vi.fn(async () => ({ action: "disconnect", notes: 0, evaluations: 0 })),
  removePlayerErrorCode: () => null,
}));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));

vi.mock("@/api/coachLevel", () => ({
  getCoachLevels: vi.fn(async () => state.levels),
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
  state.players = PLAYERS;
  state.levels = LEVELS;
  vi.mocked(editPlayer).mockClear();
});

import PlayersPage from "@/pages/PlayersPage";
import { editPlayer } from "@/api/players";

function renderAt(path: string) {
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

const block = () => screen.getByTestId("player-info-card");
const sentUpdates = () => vi.mocked(editPlayer).mock.calls.at(-1)?.[1] as Record<string, unknown>;

describe("PlayerInfoBlock (PAD-834)", () => {
  it("[PLAYERS-PROFILE-12] cancel sends nothing, save sends only the changed phone, the header edit waits", async () => {
    renderAt("/players/1");
    await screen.findByRole("heading", { name: "Rui Registered" });

    fireEvent.click(screen.getByTestId("player-info-edit"));
    expect(screen.getByTestId("player-edit")).toBeDisabled();
    // A registered student's e-mail is their login: no box for it.
    expect(within(block()).queryByTestId("player-info-email-input")).toBeNull();
    fireEvent.change(screen.getByTestId("player-info-phone-input"), { target: { value: "913000000" } });
    fireEvent.click(screen.getByTestId("player-info-cancel"));
    expect(editPlayer).not.toHaveBeenCalled();
    expect(screen.getByTestId("player-info-phone").textContent).toBe("912000000");
    expect(screen.getByTestId("player-edit")).not.toBeDisabled();

    fireEvent.click(screen.getByTestId("player-info-edit"));
    fireEvent.change(screen.getByTestId("player-info-phone-input"), { target: { value: "913000000" } });
    fireEvent.click(screen.getByTestId("player-info-save"));
    await waitFor(() => expect(editPlayer).toHaveBeenCalledTimes(1));
    const { userId, ...changed } = sentUpdates();
    expect(userId).toBe("10");
    expect(changed).toEqual({ phone: "913000000" });
    expect(await screen.findByTestId("player-info-phone")).toHaveTextContent("913000000");
  });

  it("[PLAYERS-PROFILE-22] no levels: not required; untouched empty: not blocking; completing: blocking", async () => {
    // Bea has no levels at all: Nível is not required, so a phone saves even from "Completar informação".
    state.levels = [];
    const first = renderAt("/players/2");
    await screen.findByRole("heading", { name: "Tiago NoLevel" });
    fireEvent.click(screen.getByTestId("player-needs-config-complete"));
    fireEvent.change(screen.getByTestId("player-info-phone-input"), { target: { value: "914000000" } });
    expect(screen.getByTestId("player-info-save")).not.toBeDisabled();
    expect(screen.queryByTestId("player-level-select")).toBeNull();
    first.unmount();

    // Ana has levels. A plain Editar saves a note with Nível untouched and empty.
    state.levels = LEVELS;
    renderAt("/players/2");
    await screen.findByRole("heading", { name: "Tiago NoLevel" });
    fireEvent.click(screen.getByTestId("player-info-edit"));
    fireEvent.change(screen.getByTestId("player-notes"), { target: { value: "Forehand first" } });
    expect(screen.getByTestId("player-info-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("player-info-save"));
    await waitFor(() => expect(editPlayer).toHaveBeenCalledTimes(1));
    const { userId: _u, ...note } = sentUpdates();
    expect(note).toEqual({ notes: "Forehand first" });
    expect(await screen.findByTestId("player-info-level-unset")).toBeInTheDocument();
    expect(screen.getByTestId("player-needs-config-alert")).toBeInTheDocument();

    // "Completar informação" waits for the level.
    fireEvent.click(screen.getByTestId("player-needs-config-complete"));
    fireEvent.change(screen.getByTestId("player-info-phone-input"), { target: { value: "915000000" } });
    expect(screen.getByTestId("player-info-save")).toBeDisabled();
    fireEvent.click(within(block()).getByText("I1", { exact: false }).closest("button")!);
    expect(screen.getByTestId("player-info-save")).not.toBeDisabled();
  });
});
