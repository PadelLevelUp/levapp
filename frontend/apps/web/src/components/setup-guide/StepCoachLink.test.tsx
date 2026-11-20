/** dashboard.student-setup-guide rule 12 (PAD-839): step 4 opens the existing connect flow and writes nothing. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key) }),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { roles: ["student"], coaches: [] } }) }));
vi.mock("@/api/auth", () => ({ updateMe: vi.fn() }));

import { updateMe } from "@/api/auth";
import { StepCoachLink } from "@/pages/SetupGuidePage";

describe("StepCoachLink", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-25] opens the connect flow", () => {
    render(
      <MemoryRouter>
        <StepCoachLink onLeave={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("setup-connect").getAttribute("href")).toBe("/connect");
    expect(updateMe).not.toHaveBeenCalled();
  });
});
