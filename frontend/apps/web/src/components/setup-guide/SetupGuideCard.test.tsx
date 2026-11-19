/**
 * dashboard.student-setup-guide rules 4, 5 (PAD-839): the compact card, the steps' skip/leave, the
 * loading skeleton and the coach's absence. Copy is mocked to its keys; the assertions are test ids,
 * paths and calls.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@levelup/api/src/resources/availability", () => ({
  listBlockers: vi.fn().mockResolvedValue([]),
  putSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}));
const mockGuide = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/components/setup-guide/useSetupGuide", () => ({ useSetupGuide: () => mockGuide.current }));

import { useAuth } from "@/auth/AuthContext";
import SetupGuidePage from "@/pages/SetupGuidePage";
import { SetupGuideCard, SetupGuideOnDashboard } from "./SetupGuideSurfaces";
import { makeGuide, STUDENT_ME, userEvent } from "./guide-fixture";

const DASHBOARD_BLOCK = { coachId: 1, coachName: "A", missing: ["side"], remindedToday: false, canRemind: true };

/** Steps 1 (alerts) and 4 (coach) done; 2, 3 and 5 pending: 2 of 5. */
const twoOfFive = () =>
  makeGuide({
    me: { ...STUDENT_ME, requestAlerts: true, setupGuide: { ...STUDENT_ME.setupGuide, alertsConfirmed: true, snoozedAt: new Date().toISOString() } },
    incompleteCoaches: [DASHBOARD_BLOCK],
    device: "ask",
  });

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

const wrap = (ui: React.ReactNode, at = "/dashboard") => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[at]}>
      {ui}
      <Where />
    </MemoryRouter>
  </QueryClientProvider>
);

describe("setup guide card", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-6] opens the next pending step and skip and leave write nothing", async () => {
    const user = userEvent.setup();
    const guide = twoOfFive();
    mockGuide.current = guide;

    // The card: "2 de 5", 40%, next step 2, and Continuar opens step 2.
    const first = render(wrap(<SetupGuideCard guide={guide} />));
    const card = screen.getByTestId("setup-guide-card");
    expect(card.textContent).toContain("setupGuide.card.eyebrow|2");
    expect(within(card).getByTestId("setup-guide-percent").textContent).toBe("40%");
    expect(screen.getByTestId("setup-guide-next").textContent).toContain("setupGuide.steps.device_push.title");
    await user.click(screen.getByTestId("setup-guide-continue"));
    expect(screen.getByTestId("where").textContent).toBe("/setup?step=device_push");
    first.unmount();

    // A tap on the card itself opens the next pending step too (rule 4).
    const second = render(wrap(<SetupGuideCard guide={guide} />));
    await user.click(screen.getByTestId("setup-guide-card"));
    expect(screen.getByTestId("where").textContent).toBe("/setup?step=device_push");
    second.unmount();

    // The page: Saltar on step 2 opens step 3; Agora não on step 3 returns to the dashboard.
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/setup?step=device_push"]}>
          <Routes>
            <Route path="/setup" element={<SetupGuidePage />} />
            <Route path="*" element={<div data-testid="dashboard" />} />
          </Routes>
          <Where />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByTestId("setup-step-device_push")).toBeTruthy();
    await user.click(screen.getByTestId("setup-step-skip"));
    expect(screen.getByTestId("where").textContent).toBe("/setup?step=unavailability");
    expect(screen.getByTestId("setup-step-unavailability")).toBeTruthy();
    await user.click(screen.getByTestId("setup-step-later"));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/dashboard"));

    expect(guide.write).not.toHaveBeenCalled();
    expect(guide.view.doneCount).toBe(2);
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-22] shows no ready card while the dashboard is loading", () => {
    // Four steps done; the dashboard (step 5) has not answered, so the card is a skeleton.
    const guide = makeGuide({
      me: { ...STUDENT_ME, setupGuide: { ...STUDENT_ME.setupGuide, alertsConfirmed: true, alwaysAvailable: true } },
      device: "done",
      profileIncomplete: undefined,
    });
    expect(guide.view.percent).toBeNull();
    render(wrap(<SetupGuideCard guide={guide} />));
    const card = screen.getByTestId("setup-guide-card");
    expect(card.querySelector('[data-state="loading"]')).not.toBeNull();
    expect(screen.queryByTestId("setup-guide-ready")).toBeNull();
    expect(screen.queryByTestId("setup-guide-percent")).toBeNull();
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-20] a coach never sees the guide", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { roles: ["coach"] } } as never);
    mockGuide.current = twoOfFive();
    const { container } = render(wrap(<SetupGuideOnDashboard />));
    expect(screen.queryByTestId("setup-guide-card")).toBeNull();
    expect(screen.queryByTestId("setup-guide-sheet")).toBeNull();
    expect(screen.queryByTestId("setup-guide-ready")).toBeNull();
    // Only the location probe is rendered.
    expect(container.querySelectorAll('[data-testid^="setup-guide"]')).toHaveLength(0);
  });
});
