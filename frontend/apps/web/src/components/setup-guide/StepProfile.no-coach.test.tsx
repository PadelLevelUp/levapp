/** dashboard.student-setup-guide rule 13 (PAD-839): with no coach, step 5 sends the student to step 4. */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { roles: ["player"], coaches: [] } }) }));

import { StepProfile } from "@/pages/SetupGuidePage";
import { makeGuide } from "./guide-fixture";

describe("StepProfile with no coach", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-17] with no coach, step 5 links to step 4", () => {
    render(
      <MemoryRouter>
        <StepProfile guide={makeGuide()} onLeave={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("setup-profile-to-coach").getAttribute("href")).toBe("/setup?step=coach_link");
  });
});
