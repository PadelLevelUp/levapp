/** dashboard.student-setup-guide rule 6 (PAD-839): step 1 writes straight away, then refreshes the session. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "./guide-fixture";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const refreshUser = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ user: { roles: ["student"], coaches: [{ id: 1 }] }, token: "t", refreshUser }),
}));
vi.mock("@/api/auth", () => ({ updateMe: vi.fn().mockResolvedValue({}) }));
vi.mock("@levelup/hooks", () => ({
  useAvailabilityBlockers: () => ({ isSuccess: false, data: undefined }),
  useDashboard: () => ({ isSuccess: false, data: undefined }),
}));
vi.mock("@/hooks/useDashboardWindow", () => ({ useDashboardWindow: () => ({ from: "a", to: "b" }) }));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ permission: "default", isSubscribed: false, subscribe: vi.fn() }),
}));

import { updateMe } from "@/api/auth";
import { StepRequestAlerts } from "@/pages/SetupGuidePage";
import { useSetupGuide } from "./useSetupGuide";

function Harness({ onDone }: { onDone: () => void }) {
  const guide = useSetupGuide();
  return <StepRequestAlerts guide={guide} onDone={onDone} onLeave={() => {}} />;
}

describe("StepRequestAlerts", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-3] turns request alerts on and refreshes the auth user", async () => {
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);
    await userEvent.setup().click(screen.getByTestId("setup-alerts-enable"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledTimes(1);
    expect(updateMe).toHaveBeenCalledWith({ requestAlerts: true, setupGuideAlertsConfirmed: true });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateMe).mock.invocationCallOrder[0]).toBeLessThan(refreshUser.mock.invocationCallOrder[0]);
  });
});
