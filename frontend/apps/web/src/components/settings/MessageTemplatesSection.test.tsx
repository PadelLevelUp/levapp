/**
 * settings.unsaved-edits rule 2 (PAD-394, ledger B-157): the section already computed
 * `isDirty` by value against the `templates` prop (the parent's last loaded/saved
 * value) — this reuses it as-is, so these tests pin that the reused flag still
 * follows rule 2 once it drives the page-level registry.
 */
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MessageTemplates } from "@/types";

const updateNotificationConfig = vi.fn();
vi.mock("@/api/notificationEngine", () => ({
  updateNotificationConfig: (...a: unknown[]) => updateNotificationConfig(...a),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MessageTemplatesSection } from "./MessageTemplatesSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const TEMPLATES: MessageTemplates = {
  invite: "invite {name}",
  confirm: "confirm {name}",
  decline: "decline {name}",
  spot_filled: "spot filled",
  reminder: "reminder {name}",
  reminder_followup: "reminder followup",
  reminder_confirmed: "reminder confirmed",
  reminder_declined: "reminder declined",
  waiting_list_offer: "waiting list offer",
  waiting_list_placed: "waiting list placed",
};

// Mirrors how NotificationsEngineSection wires it: `onChange` feeds back into the
// `templates` prop, which is what `isDirty` (and rule 2) compares `local` against.
function Wrapper() {
  const [templates, setTemplates] = useState<MessageTemplates>(TEMPLATES);
  return <MessageTemplatesSection templates={templates} onChange={setTemplates} />;
}

beforeEach(() => {
  updateNotificationConfig.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;
const reminderTextarea = () =>
  within(screen.getByTestId("template-row-reminder")).getByRole("textbox") as HTMLTextAreaElement;
const saveButton = () => screen.getByText("settings.templates.saveTemplates");

describe("MessageTemplatesSection — reports unsaved by rule 2 (PAD-394)", () => {
  it("reports unsaved after an edit, and clean again once undone by hand", () => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    expect(unsavedIds()).toBe("");

    fireEvent.change(reminderTextarea(), { target: { value: "reminder {name} at {time}" } });
    expect(unsavedIds()).toBe("messageTemplates");

    fireEvent.change(reminderTextarea(), { target: { value: "reminder {name}" } });
    expect(unsavedIds()).toBe("");
  });

  it("is clean again after a successful save", async () => {
    updateNotificationConfig.mockResolvedValue({});
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    fireEvent.change(reminderTextarea(), { target: { value: "reminder {name} at {time}" } });
    expect(unsavedIds()).toBe("messageTemplates");

    fireEvent.click(saveButton());
    await waitFor(() => expect(updateNotificationConfig).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("stays unsaved after a failed save", async () => {
    updateNotificationConfig.mockRejectedValue(new Error("nope"));
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    fireEvent.change(reminderTextarea(), { target: { value: "reminder {name} at {time}" } });
    expect(unsavedIds()).toBe("messageTemplates");

    fireEvent.click(saveButton());
    await waitFor(() => expect(updateNotificationConfig).toHaveBeenCalledTimes(1));
    expect(unsavedIds()).toBe("messageTemplates");
  });
});
