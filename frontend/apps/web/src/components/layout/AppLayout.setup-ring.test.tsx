/**
 * dashboard.student-setup-guide rule 4 (PAD-839): the avatar ring. AppLayout wraps its header avatar
 * in `SetupGuideAvatar`; rendering the whole layout needs the router, the nav, the notification and
 * session stacks, so this renders `SetupGuideAvatar` itself with the session and the guide state
 * mocked (the real `setupGuideState` decides the view).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key) }),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: vi.fn() }));
const mockGuide = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/components/setup-guide/useSetupGuide", () => ({ useSetupGuide: () => mockGuide.current }));

import { useAuth } from "@/auth/AuthContext";
import { SetupGuideAvatar } from "@/components/setup-guide/SetupGuideSurfaces";
import { makeGuide, STUDENT_ME } from "@/components/setup-guide/guide-fixture";

const DASHBOARD_BLOCK = { coachId: 1, coachName: "A", missing: ["side"], remindedToday: false, canRemind: true };

/** Alerts confirmed, device and coach done; unavailability and profile pending: 3 of 5. */
const sixty = () =>
  makeGuide({
    me: { ...STUDENT_ME, setupGuide: { ...STUDENT_ME.setupGuide, alertsConfirmed: true } },
    device: "done",
    incompleteCoaches: [DASHBOARD_BLOCK],
  });
const hundred = () =>
  makeGuide({
    me: { ...STUDENT_ME, setupGuide: { ...STUDENT_ME.setupGuide, alertsConfirmed: true, alwaysAvailable: true } },
    device: "done",
  });

const renderAvatar = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SetupGuideAvatar>
        <span data-testid="avatar" />
      </SetupGuideAvatar>
    </QueryClientProvider>
  );

describe("avatar ring", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-7] the avatar ring shows the percent for a student until 100", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { roles: ["student"] } } as never);

    mockGuide.current = sixty();
    const a = renderAvatar();
    expect(screen.getByTestId("setup-guide-ring").getAttribute("data-percent")).toBe("60");
    expect(screen.getByTestId("avatar")).toBeTruthy();
    a.unmount();

    mockGuide.current = hundred();
    const b = renderAvatar();
    expect(screen.queryByTestId("setup-guide-ring")).toBeNull();
    expect(screen.getByTestId("avatar")).toBeTruthy();
    b.unmount();

    vi.mocked(useAuth).mockReturnValue({ user: { roles: ["coach"] } } as never);
    mockGuide.current = sixty();
    renderAvatar();
    expect(screen.queryByTestId("setup-guide-ring")).toBeNull();
    expect(screen.getByTestId("avatar")).toBeTruthy();
  });
});
