/**
 * settings.unsaved-edits rule 2 (PAD-394, ledger B-157): "unsaved" is whether the
 * three toggles + reason differ BY VALUE from the last loaded/saved values — not
 * "was a control ever touched". A toggle flipped then flipped back is clean again;
 * a successful save is the new clean baseline; a failed save stays unsaved.
 * settings.explicit-save (PAD-506): sent by the tab's one Save (the harness's `harness-save`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getMe = vi.fn();
const updateMe = vi.fn();
vi.mock("@/api/auth", () => ({
  getMe: (...a: unknown[]) => getMe(...a),
  updateMe: (...a: unknown[]) => updateMe(...a),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { StudentNotificationBlocksSection } from "./StudentNotificationBlocksSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const ME = {
  blockAutoInvitations: false,
  blockManualInvitations: false,
  blockAllNotifications: false,
  notificationBlockReason: "",
};

beforeEach(() => {
  getMe.mockReset().mockResolvedValue(ME);
  updateMe.mockReset().mockResolvedValue(ME);
});

const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;

describe("StudentNotificationBlocksSection — reports unsaved by rule 2 (PAD-394)", () => {
  it("reports unsaved after an edit, and clean again once undone by hand", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <StudentNotificationBlocksSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("student-notif-block-auto");
    expect(unsavedIds()).toBe("");

    fireEvent.click(screen.getByTestId("student-notif-block-auto"));
    expect(unsavedIds()).toBe("studentNotificationBlocks");

    fireEvent.click(screen.getByTestId("student-notif-block-auto"));
    expect(unsavedIds()).toBe("");
  });

  it("reports unsaved for a reason edit, clean again once undone by hand", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <StudentNotificationBlocksSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("student-notif-reason");
    fireEvent.change(screen.getByTestId("student-notif-reason"), { target: { value: "Injured" } });
    expect(unsavedIds()).toBe("studentNotificationBlocks");

    fireEvent.change(screen.getByTestId("student-notif-reason"), { target: { value: "" } });
    expect(unsavedIds()).toBe("");
  });

  it("is clean again after a successful save, sent by the tab's one Save with the held values", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <StudentNotificationBlocksSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("student-notif-block-auto");
    fireEvent.click(screen.getByTestId("student-notif-block-auto"));
    fireEvent.change(screen.getByTestId("student-notif-reason"), { target: { value: " Injured " } });
    expect(unsavedIds()).toBe("studentNotificationBlocks");
    expect(updateMe).not.toHaveBeenCalled(); // held until the Save

    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledWith({
      blockAutoInvitations: true,
      blockManualInvitations: false,
      blockAllNotifications: false,
      notificationBlockReason: "Injured",
    });
    await waitFor(() => expect(unsavedIds()).toBe(""));
    expect(screen.getByTestId("save-failed")).toHaveTextContent("");
  });

  it("stays unsaved after a failed save, and is listed as failed", async () => {
    updateMe.mockRejectedValue(new Error("nope"));
    render(
      <SettingsUnsavedTestHarness>
        <StudentNotificationBlocksSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("student-notif-block-auto");
    fireEvent.click(screen.getByTestId("student-notif-block-auto"));
    expect(unsavedIds()).toBe("studentNotificationBlocks");

    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("save-failed")).toHaveTextContent("studentNotificationBlocks"));
    expect(unsavedIds()).toBe("studentNotificationBlocks");
  });

  it("there is no section Save button any more", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <StudentNotificationBlocksSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("student-notif-block-auto");
    expect(screen.queryByTestId("student-notif-save")).toBeNull();
  });
});
