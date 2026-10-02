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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

import SettingsPage, { parseTab } from "./SettingsPage";
import i18n from "@/i18n";

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
  // jsdom has no PointerEvent, so Radix Select (opened on a mouse pointerdown) never sees its
  // pointerType; this gives fireEvent.pointerDown a real one (PAD-473's language tests).
  if (!window.PointerEvent) {
    class PointerEventPolyfill extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
    }
    window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
  }
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  // The real endpoint answers with the profile as stored: the patch applied.
  updateMe.mockReset().mockImplementation(async (patch: object) => ({ ...ME, ...patch }));
  getCoachWorkingHours.mockReset().mockResolvedValue({ workingHours: null });
  putCoachWorkingHours.mockReset();
});

function goto(path: string) {
  window.history.pushState({}, "", path);
}

// PAD-459: the avatar menu's navigation, from outside the page, plus the router's current search.
function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="probe-search">{location.search}</span>
      <button data-testid="probe-go-connections" onClick={() => navigate("/settings?tab=connections")} />
      <button data-testid="probe-go-settings" onClick={() => navigate("/settings")} />
      <button
        data-testid="probe-go-connections-with-param"
        onClick={() => navigate("/settings?tab=connections&competencies=open")}
      />
    </>
  );
}

// A fresh query client per render: the page's sections that are not stubbed here may read through
// @levelup/hooks (PAD-404's reminder setting on the Preferences tab does), and a shared client
// would carry one test's cache into the next.
function renderSettings() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
        <SettingsPage />
        <RouterProbe />
      </MemoryRouter>
    </QueryClientProvider>
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

describe("SettingsPage — the tab follows the URL (PAD-459, settings.role-scope rule 2)", () => {
  it("parseTab reads ?tab=, and an unknown or missing tab is Preferences", () => {
    expect(parseTab("?tab=connections")).toBe("connections");
    expect(parseTab("?tab=calendar")).toBe("calendar");
    expect(parseTab("?tab=nonsense")).toBe("preferences");
    expect(parseTab("")).toBe("preferences");
  });

  it("a second navigation while Settings is open lands on My connections, without a remount", async () => {
    goto("/settings");
    renderSettings();
    await screen.findByTestId("settings-request-alerts");
    const readsBefore = getMe.mock.calls.length;

    fireEvent.click(screen.getByTestId("probe-go-connections"));
    expect(await screen.findByTestId("settings-connections")).toBeInTheDocument();
    // The page did not remount: its mount-time profile read did not run again.
    expect(getMe.mock.calls.length).toBe(readsBefore);

    fireEvent.click(screen.getByTestId("probe-go-settings"));
    expect(await screen.findByTestId("settings-request-alerts")).toBeInTheDocument();
  });

  it("Discard on a URL-driven switch lands on My connections and the URL stays there", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("probe-go-connections"));
    fireEvent.click(screen.getByTestId("settings-unsaved-discard"));

    expect(await screen.findByTestId("settings-connections")).toBeInTheDocument();
    // Give any stray revert a chance to land before asserting it did not.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("probe-search").textContent).toBe("?tab=connections");
    expect(screen.getByTestId("settings-connections")).toBeInTheDocument();
  });

  it("the revert keeps the URL's other params (B's review of #456)", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("probe-go-connections-with-param"));
    fireEvent.click(screen.getByTestId("settings-unsaved-keep"));

    await waitFor(() =>
      expect(screen.getByTestId("probe-search").textContent).toBe("?tab=calendar&competencies=open")
    );
  });

  it("Escape on a URL-driven switch keeps editing and reverts the URL too", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("probe-go-connections"));
    fireEvent.keyDown(screen.getByTestId("settings-unsaved-dialog"), { key: "Escape" });

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    expect(screen.getByTestId("working-hours")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("probe-search").textContent).toBe("?tab=calendar"));
  });

  it("Keep editing on a URL-driven switch puts ?tab= back on the section still shown", async () => {
    await openOnCalendarAndToggleSunday();
    fireEvent.click(screen.getByTestId("probe-go-connections"));
    expect(dialog()).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("settings-unsaved-keep"));

    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByTestId("working-hours")).toBeInTheDocument();
    expect(sunday()).toHaveAttribute("data-state", "off");
    await waitFor(() => expect(screen.getByTestId("probe-search").textContent).toBe("?tab=calendar"));
  });
});

describe("SettingsPage — save on change (settings.save-on-change, PAD-473)", () => {
  async function chooseLanguage(lang: "pt" | "en") {
    fireEvent.click(await screen.findByTestId(`select-option-${lang}`));
  }

  it("B-244: choosing a language stores it at once, shows it, and signs it", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    await waitFor(() => expect(getMe).toHaveBeenCalled());

    await chooseLanguage("pt");

    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ language: "pt" }));
    expect(i18n.changeLanguage).toHaveBeenCalledWith("pt");
    await waitFor(() => expect(screen.getByTestId("settings-language-sign")).toHaveAttribute("data-state", "saved"));
  });

  it("a failed language save says so and returns to the confirmed language", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    updateMe.mockRejectedValueOnce(new Error("offline"));

    await chooseLanguage("pt");

    await waitFor(() => expect(screen.getByTestId("settings-language-sign")).toHaveAttribute("data-state", "failed"));
    expect(i18n.changeLanguage).toHaveBeenLastCalledWith("en");
    expect(screen.getByLabelText("settings.language")).toHaveAttribute("data-value", "en");
  });

  it("request alerts sign their save; a failure says so and switches back", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    const toggle = await screen.findByTestId("settings-request-alerts");
    await waitFor(() => expect(toggle).toHaveAttribute("data-state", "checked"));

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("settings-request-alerts-sign")).toHaveAttribute("data-state", "saved"));

    updateMe.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByTestId("settings-request-alerts-sign")).toHaveAttribute("data-state", "failed"));
    expect(toggle).toHaveAttribute("data-state", "unchecked");
  });

  it("the page-header Save shows on Perfil only (rule 4)", async () => {
    // By test id: an accessible-name query over this page's DOM is what made the test load-sensitive.
    const headerSave = () => screen.queryByTestId("settings-header-save");
    goto("/settings?tab=profile");
    renderSettings();
    expect(await screen.findByTestId("settings-header-save")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("settings-nav-preferences"));
    await screen.findByTestId("settings-request-alerts");
    expect(headerSave()).not.toBeInTheDocument();

    // Calendar: its sections have their own Save buttons, so the page header has nothing to save there.
    fireEvent.click(screen.getByTestId("settings-nav-calendar"));
    await screen.findByTestId("working-hours-works-sun");
    expect(headerSave()).not.toBeInTheDocument();
  });


  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }
  const shownLanguage = () => screen.getByLabelText("settings.language").getAttribute("data-value");

  it("rule 3 / review #497: a late opening read does not replace a confirmed language", async () => {
    const read = deferred<typeof ME>();
    getMe.mockReset().mockReturnValueOnce(read.promise);
    updateMe.mockImplementationOnce(async () => ({ ...ME, language: "pt" }));
    goto("/settings?tab=preferences");
    renderSettings();

    await chooseLanguage("pt");
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    await act(async () => { read.resolve(ME); }); // the read started before the PATCH: it says en
    await waitFor(() => expect(shownLanguage()).toBe("pt"));

    updateMe.mockRejectedValueOnce(new Error("offline"));
    await chooseLanguage("en");
    await waitFor(() => expect(screen.getByTestId("settings-language-sign")).toHaveAttribute("data-state", "failed"));
    expect(shownLanguage()).toBe("pt");
    expect(i18n.changeLanguage).toHaveBeenLastCalledWith("pt");
  });

  it("rule 3 / review #497: a language save failing before the opening read lands returns to the language shown", async () => {
    getMe.mockReset().mockReturnValueOnce(new Promise(() => undefined));
    updateMe.mockRejectedValueOnce(new Error("offline"));
    goto("/settings?tab=preferences");
    renderSettings();

    await chooseLanguage("pt");
    await waitFor(() => expect(screen.getByTestId("settings-language-sign")).toHaveAttribute("data-state", "failed"));
    expect(shownLanguage()).toBe("en");
    expect(i18n.changeLanguage).toHaveBeenLastCalledWith("en");
  });

  it("rule 3: two held language saves both fail — back to the confirmed language, not the one the last started from", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    await waitFor(() => expect(shownLanguage()).toBe("en"));
    const y = deferred<typeof ME>();
    const z = deferred<typeof ME>();
    updateMe.mockReturnValueOnce(y.promise).mockReturnValueOnce(z.promise);

    await chooseLanguage("pt"); // Y
    await chooseLanguage("en"); // Z, started from pt
    await act(async () => { y.reject(new Error("y")); });
    await act(async () => { z.reject(new Error("z")); });

    expect(shownLanguage()).toBe("en");
    expect(i18n.changeLanguage).toHaveBeenLastCalledWith("en");
  });

  it("rule 3: request alerts — two held saves both fail, back to the confirmed value", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    const toggle = await screen.findByTestId("settings-request-alerts");
    await waitFor(() => expect(toggle).toHaveAttribute("data-state", "checked"));
    const y = deferred<typeof ME>();
    const z = deferred<typeof ME>();
    updateMe.mockReturnValueOnce(y.promise).mockReturnValueOnce(z.promise);

    fireEvent.click(toggle); // Y: off
    fireEvent.click(toggle); // Z: on, started from off
    await act(async () => { y.reject(new Error("y")); });
    await act(async () => { z.reject(new Error("z")); });

    expect(toggle).toHaveAttribute("data-state", "checked");
  });

  it("settings.unsaved-edits rule 1: frequency and scale save on change and never ask", async () => {
    goto("/settings?tab=preferences");
    renderSettings();
    fireEvent.click(await screen.findByTestId("settings-evaluation-scale-option-10"));
    fireEvent.click(await screen.findByTestId("settings-evaluation-reminder-option-monthly"));
    await waitFor(() => expect(evaluationApi.putEvaluationScale).toHaveBeenCalledWith({ scaleMax: 10 }));
    await waitFor(() => expect(evaluationApi.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "monthly" }));

    fireEvent.click(screen.getByTestId("settings-nav-calendar"));
    expect(dialog()).not.toBeInTheDocument();
    expect(await screen.findByTestId("working-hours-works-sun")).toBeInTheDocument();
  });
});
