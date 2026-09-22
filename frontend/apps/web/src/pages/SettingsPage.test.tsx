/**
 * settings.unsaved-edits (PAD-394, ledger B-157). Leaving a Settings section that
 * holds an unsaved edit used to be silent — this pins the page-level guard: rules
 * 1-6 and the "switching tab with an unsaved edit" / "nothing unsaved" / "a saved
 * edit is clean" / "a save-on-change section never asks" / "closing the page"
 * acceptance criteria.
 *
 * Only WorkingHoursSection is real here — it drives the guard through a genuine
 * rule-2 section (its own unsaved-reporting is pinned separately in
 * WorkingHoursSection.test.tsx). Every other tab's section is a stub: this file's
 * job is the page-level wiring (the registry, the two nav call sites, the
 * mobile-width back button, beforeunload), not each section's own save logic.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { roles: ["coach"], isSuperAdmin: false },
    refreshUser: vi.fn(),
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn() } }));

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

import SettingsPage from "./SettingsPage";

const ME = {
  name: "Coach",
  abbreviation: "CO",
  email: "coach@example.com",
  phone: "",
  language: "en",
  emailVerification: "verified",
  requestAlerts: true,
};

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset().mockResolvedValue(ME);
  getCoachWorkingHours.mockReset().mockResolvedValue({ workingHours: null });
  putCoachWorkingHours.mockReset();
});

function goto(path: string) {
  window.history.pushState({}, "", path);
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

const sunday = () => screen.getByTestId("working-hours-day-sun");
const dialog = () => screen.queryByTestId("settings-unsaved-dialog");

async function openOnCalendarAndToggleSunday() {
  goto("/settings?tab=calendar");
  renderSettings();
  await screen.findByTestId("working-hours-works-sun");
  fireEvent.click(screen.getByTestId("working-hours-works-sun"));
  expect(sunday()).toHaveAttribute("data-state", "off");
}

describe("SettingsPage — unsaved-edits tab-switch guard (PAD-394, B-157)", () => {
  it("asks before a desktop-nav tab switch with an unsaved edit, and stays on the current tab", async () => {
    await openOnCalendarAndToggleSunday();

    fireEvent.click(screen.getByTestId("settings-nav-preferences"));

    expect(dialog()).toBeInTheDocument();
    // Rule 3: the current tab stays shown while the question is open.
    expect(screen.getByTestId("working-hours")).toBeInTheDocument();
    expect(screen.queryByTestId("settings-request-alerts")).not.toBeInTheDocument();
  });

  it("Keep editing: closes the dialog, stays on the current tab, edit intact", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("settings-nav-preferences"));
    expect(dialog()).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("settings-unsaved-keep"));

    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByTestId("working-hours")).toBeInTheDocument();
    expect(sunday()).toHaveAttribute("data-state", "off");
  });

  it("Discard: switches to the chosen tab, and the section unmounts (a later return reloads fresh)", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("settings-nav-preferences"));
    fireEvent.click(screen.getByTestId("settings-unsaved-discard"));

    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-request-alerts")).toBeInTheDocument();
    expect(screen.queryByTestId("working-hours")).not.toBeInTheDocument();

    // Back to Calendar: nothing was unsaved any more (discarded), so this switch
    // is immediate, and the section — having unmounted — loads fresh from the
    // server, not from the dropped local edit.
    fireEvent.click(screen.getByTestId("settings-nav-calendar"));
    expect(dialog()).not.toBeInTheDocument();
    await waitFor(() => expect(getCoachWorkingHours).toHaveBeenCalledTimes(2));
    await screen.findByTestId("working-hours-works-sun");
    expect(sunday()).toHaveAttribute("data-state", "working");
  });

  it("nothing unsaved: switches at once, no dialog", async () => {
    goto("/settings?tab=calendar");
    renderSettings();
    await screen.findByTestId("working-hours-works-sun");

    fireEvent.click(screen.getByTestId("settings-nav-preferences"));

    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-request-alerts")).toBeInTheDocument();
  });

  it("an edit undone by hand: no dialog (rule 2, not 'was touched')", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("working-hours-works-sun")); // back on
    expect(sunday()).toHaveAttribute("data-state", "working");

    fireEvent.click(screen.getByTestId("settings-nav-preferences"));

    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-request-alerts")).toBeInTheDocument();
  });

  it("a successful save: no dialog", async () => {
    putCoachWorkingHours.mockImplementation((value: unknown) => Promise.resolve({ workingHours: value }));
    await openOnCalendarAndToggleSunday();

    fireEvent.click(screen.getByTestId("working-hours-save"));
    await waitFor(() => expect(putCoachWorkingHours).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("settings-nav-preferences"));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("a save-on-change section (request alerts) never asks", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    await screen.findByTestId("settings-request-alerts");

    fireEvent.click(screen.getByTestId("settings-request-alerts"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId("settings-nav-calendar"));
    expect(dialog()).not.toBeInTheDocument();
  });

  it("choosing the tab that is already active never asks", async () => {
    await openOnCalendarAndToggleSunday();

    fireEvent.click(screen.getByTestId("settings-nav-calendar"));

    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByTestId("working-hours")).toBeInTheDocument();
    expect(sunday()).toHaveAttribute("data-state", "off");
  });

  it("the mobile-width nav also goes through the guard", async () => {
    await openOnCalendarAndToggleSunday();

    fireEvent.click(screen.getByTestId("settings-mobile-nav-preferences"));

    expect(dialog()).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("settings-unsaved-discard"));
    expect(screen.getByTestId("settings-request-alerts")).toBeInTheDocument();
  });

  it("the mobile-width 'back to the list' does not unmount the section and never asks", async () => {
    goto("/settings?tab=calendar");
    renderSettings();
    // Land inside the (already-active) Calendar section via the mobile list,
    // exactly like opening it on a phone.
    fireEvent.click(screen.getByTestId("settings-mobile-nav-calendar"));
    await screen.findByTestId("working-hours-works-sun");
    fireEvent.click(screen.getByTestId("working-hours-works-sun"));
    expect(sunday()).toHaveAttribute("data-state", "off");

    fireEvent.click(screen.getByTestId("settings-mobile-back"));

    expect(dialog()).not.toBeInTheDocument();
    // Still mounted (CSS-only hide), so the edit is still there.
    expect(sunday()).toHaveAttribute("data-state", "off");

    // Reopening the same section keeps the edit — it was never reloaded.
    fireEvent.click(screen.getByTestId("settings-mobile-nav-calendar"));
    expect(dialog()).not.toBeInTheDocument();
    expect(sunday()).toHaveAttribute("data-state", "off");
    expect(getCoachWorkingHours).toHaveBeenCalledTimes(1);
  });

  it("registers beforeunload only while a section is unsaved, and removes it once clean", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    await openOnCalendarAndToggleSunday();

    await waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function))
    );

    fireEvent.click(screen.getByTestId("working-hours-works-sun")); // undo by hand — clean again
    await waitFor(() =>
      expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function))
    );

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
