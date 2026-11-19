/** dashboard.student-setup-guide rule 13 (PAD-839): step 5 shows each coach's level and side and can only remind. */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key) }),
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: {
      roles: ["student"],
      coaches: [
        { id: 1, name: "A", level: "B2", side: "left" },
        { id: 2, name: "B", level: "C1", side: null },
      ],
    },
  }),
}));
vi.mock("@levelup/api/src/resources/dashboard", () => ({ sendProfileReminder: vi.fn().mockResolvedValue({ ok: true }) }));

import * as dashboardApi from "@levelup/api/src/resources/dashboard";
import { StepProfile } from "@/pages/SetupGuidePage";
import { makeGuide, STUDENT_ME, userEvent } from "./guide-fixture";

describe("StepProfile", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-17] shows each coach's level and side, reminds, and stays pending until every coach completes", async () => {
    const guide = makeGuide({
      me: { ...STUDENT_ME, coaches: [{ id: 1 }, { id: 2 }] },
      incompleteCoaches: [{ coachId: 2, coachName: "B", missing: ["side"], remindedToday: false, canRemind: true }],
    });
    expect(guide.view.steps.profile).toBe("pending");
    render(<StepProfile guide={guide} onLeave={() => {}} />);

    // A: level and side, no button.
    expect(screen.getByTestId("setup-profile-level-1").textContent).toContain("B2");
    expect(screen.getByTestId("setup-profile-side-1").textContent).toContain("setupGuide.profile.sides.left");
    expect(screen.queryByTestId("setup-remind-1")).toBeNull();

    // B: level, side unset, a reminder button.
    expect(screen.getByTestId("setup-profile-level-2").textContent).toContain("C1");
    expect(screen.getByTestId("setup-profile-side-2").textContent).toContain("setupGuide.profile.unset");
    await userEvent.setup().click(screen.getByTestId("setup-remind-2"));

    expect(dashboardApi.sendProfileReminder).toHaveBeenCalledTimes(1);
    expect(dashboardApi.sendProfileReminder).toHaveBeenCalledWith(2);
    await waitFor(() => expect(screen.getByTestId("setup-reminded-2")).toBeTruthy());
    expect(screen.queryByTestId("setup-remind-2")).toBeNull();

    // Still pending: nothing marks it done, and no "all set" line.
    expect(guide.view.steps.profile).toBe("pending");
    expect(screen.queryByText("setupGuide.profile.allSet")).toBeNull();
    expect(guide.write).not.toHaveBeenCalled();
  });
});
