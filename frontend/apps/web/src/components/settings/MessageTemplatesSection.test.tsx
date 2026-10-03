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
  waiting_list_invite: "waiting list invite {side}",
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

describe("MessageTemplatesSection — the waiting-list invitation (PAD-446, message-templates rules 2, 15)", () => {
  it("edits waiting_list_invite, offers {side} on it alone, and no longer lists waiting_list_placed", () => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    expect(screen.queryByTestId("template-row-waiting_list_placed")).toBeNull();
    const row = screen.getByTestId("template-row-waiting_list_invite");
    expect(within(row).getByText("{side}")).toBeTruthy();
    expect(within(screen.getByTestId("template-row-invite")).queryByText("{side}")).toBeNull();
  });
});

describe("MessageTemplatesSection — placeholder hints (PAD-430, message-templates rule 3)", () => {
  const CLASS_KEYS = ["invite", "reminder", "reminder_followup", "waiting_list_invite"] as const;
  const EXPECTED = ["{name}", "{level}", "{weekday}", "{time}", "{type}", "{date}", "{court}"];

  it.each(CLASS_KEYS)("offers all seven placeholders on %s", (key) => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    const row = screen.getByTestId(`template-row-${key}`);
    for (const token of EXPECTED) {
      expect(within(row).getByText(token)).toBeTruthy();
    }
  });

  // PAD-489 (notifications.reminders rule 22): the two "added to class" messages are editable
  // like the others, and take {class} and {when} on top of the class vocabulary. A config
  // from before the keys existed has no text for them: the row still shows, empty, and the
  // server falls back to its default.
  it.each(["added_to_class", "added_to_class_coming"] as const)("offers the class vocabulary plus {class} and {when} on %s", (key) => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    const row = screen.getByTestId(`template-row-${key}`);
    for (const token of [...EXPECTED, "{class}", "{when}"]) {
      expect(within(row).getByText(token)).toBeTruthy();
    }
  });

  it("inserts {court} into the textarea when its hint is clicked", () => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    fireEvent.click(within(screen.getByTestId("template-row-reminder")).getByText("{court}"));
    expect(reminderTextarea().value).toContain("{court}");
  });
});
