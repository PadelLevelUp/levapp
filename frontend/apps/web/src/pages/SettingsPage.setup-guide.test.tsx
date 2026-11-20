/**
 * settings.role-scope rule 10 (PAD-839): "Configurar conta" is a student-only row inside the Profile
 * section that opens the setup guide; the section lists of rule 2 do not change. The module mocks
 * are SettingsPage.test.tsx's, with the session's role switchable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const role = vi.hoisted(() => ({ current: "player" as "player" | "coach" }));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { roles: [role.current], isSuperAdmin: false },
    refreshUser: vi.fn(),
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

// `language` is what AuthContext applied from the stored profile before the page mounts (B-184).
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn(), language: "en" } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const getMe = vi.fn();
const updateMe = vi.fn();
vi.mock("@/api/auth", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  updateMe: (...a: unknown[]) => updateMe(...a),
}));

vi.mock("@/api/clubs", () => ({
  listMyClubJoinRequests: () => Promise.resolve([]),
}));

const getCoachWorkingHours = vi.fn();
const putCoachWorkingHours = vi.fn();
// Partial mock: SettingsPage's module graph statically imports every tab's
// section (DataImportSection etc.), several of which pull in "@/api/client",
// which calls the real `initApi` at import time — so the rest of "@levelup/api"
// must stay real, and only `workingHoursApi` is swapped out.
vi.mock("@levelup/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@levelup/api")>();
  return {
    ...actual,
    workingHoursApi: {
      getCoachWorkingHours: (...a: unknown[]) => getCoachWorkingHours(...a),
      putCoachWorkingHours: (...a: unknown[]) => putCoachWorkingHours(...a),
    },
  };
});

// The Preferences tab's evaluation settings read through @levelup/hooks; answered here so the tab makes no
// network call (review #497 item 8: a real request made these tests load-sensitive).
const evaluationApi = vi.hoisted(() => ({
  getEvaluationSettings: vi.fn(async () => ({ reminder: "never" })),
  putEvaluationSettings: vi.fn(async (body: unknown) => body),
  getEvaluationScale: vi.fn(async () => ({ scaleMax: 5 })),
  putEvaluationScale: vi.fn(async (body: unknown) => body),
}));
vi.mock("@levelup/api/src/resources/evaluationSettings", () => ({
  getEvaluationSettings: evaluationApi.getEvaluationSettings,
  putEvaluationSettings: evaluationApi.putEvaluationSettings,
}));
vi.mock("@levelup/api/src/resources/evaluationScale", () => ({
  getEvaluationScale: evaluationApi.getEvaluationScale,
  putEvaluationScale: evaluationApi.putEvaluationScale,
}));

// Stubs — these tabs/sections have their own tests; this file only drives the
// page-level tab-switch guard through ONE real rule-2 section (working hours).
vi.mock("@/components/settings/SeasonsSection", () => ({
  SeasonsSection: () => <div data-testid="stub-seasons" />,
}));
vi.mock("@/components/settings/CoachLevelsSection", () => ({
  CoachLevelsSection: () => <div data-testid="stub-coach-levels" />,
}));
vi.mock("@/components/evaluations/competency-manager/CompetenciesSettingsEntry", () => ({
  CompetenciesSettingsEntry: () => <div data-testid="stub-competencies" />,
}));

// A light stand-in for the Radix Select (language, theme): opening the real one over this page's DOM
// takes ~15 s in jsdom. It keeps the contract the page relies on — value in, onValueChange out.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type Ctx = { value?: string; onValueChange?: (v: string) => void };
  const SelectCtx = React.createContext<Ctx>({});
  return {
    Select: ({ value, onValueChange, children }: Ctx & { children: React.ReactNode }) => (
      <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({ id, "aria-label": ariaLabel, children }: { id?: string; "aria-label"?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(SelectCtx);
      return <div id={id} aria-label={ariaLabel} data-value={ctx.value}>{children}</div>;
    },
    SelectValue: () => <span>{React.useContext(SelectCtx).value}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(SelectCtx);
      return <button type="button" data-testid={`select-option-${value}`} onClick={() => ctx.onValueChange?.(value)}>{children}</button>;
    },
  };
});

import SettingsPage from "./SettingsPage";

const ME = { name: "Ana", abbreviation: "AN", email: "ana@example.com", phone: "", language: "en",
  emailVerification: "verified", requestAlerts: true, birthDate: "1990-05-01", country: "PT" };

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset();
  getCoachWorkingHours.mockReset().mockResolvedValue({ workingHours: null });
});

function Path() {
  return <span data-testid="probe-path">{useLocation().pathname}</span>;
}

function renderProfileTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settings?tab=profile"]}>
        <SettingsPage />
        <Path />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Configurar conta (settings.role-scope rule 10)", () => {
  it("[SETTINGS-ROLE-SCOPE-14] only a student sees Configurar conta inside Profile", async () => {
    role.current = "player";
    const student = renderProfileTab();
    fireEvent.click(await screen.findByTestId("settings-setup-guide-open"));
    await waitFor(() => expect(screen.getByTestId("probe-path")).toHaveTextContent("/setup"));
    student.unmount();

    role.current = "coach";
    renderProfileTab();
    await screen.findByLabelText("settings.profile.name");
    expect(screen.queryByTestId("settings-setup-guide")).toBeNull();
  });
});
