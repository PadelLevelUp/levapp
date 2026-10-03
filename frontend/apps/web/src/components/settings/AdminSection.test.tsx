/**
 * settings.explicit-save (PAD-506): the admin's "coach approval required" switch is held until the
 * tab's one Save (the harness's `harness-save`), which sends it once. By test id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const admin = vi.hoisted(() => ({
  listPendingCoaches: vi.fn(),
  getAdminSettings: vi.fn(),
  updateAdminSettings: vi.fn(),
  approveCoach: vi.fn(),
  rejectCoach: vi.fn(),
}));
vi.mock("@/api/admin", () => admin);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { AdminSection } from "./AdminSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

beforeEach(() => {
  Object.values(admin).forEach((fn) => fn.mockReset());
  admin.listPendingCoaches.mockResolvedValue([]);
  admin.getAdminSettings.mockResolvedValue({ coachApprovalRequired: false, source: "database" });
  admin.updateAdminSettings.mockImplementation(async (patch: object) => ({ coachApprovalRequired: false, source: "database", ...patch }));
});

const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;

describe("AdminSection — the approval switch waits for the Save (PAD-506)", () => {
  it("switching it on sends nothing; the Save sends it once and the tab is clean", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <AdminSection />
      </SettingsUnsavedTestHarness>,
    );
    const toggle = await screen.findByTestId("admin-coach-approval-required-switch");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(admin.updateAdminSettings).not.toHaveBeenCalled();
    expect(unsavedIds()).toBe("adminSettings");

    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(admin.updateAdminSettings).toHaveBeenCalledWith({ coachApprovalRequired: true }));
    expect(admin.updateAdminSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("on and off again is clean", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <AdminSection />
      </SettingsUnsavedTestHarness>,
    );
    const toggle = await screen.findByTestId("admin-coach-approval-required-switch");

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(unsavedIds()).toBe("");
  });
});
