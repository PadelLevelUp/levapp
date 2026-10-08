/**
 * settings.explicit-save (PAD-506): the section is controlled (value/onChange). The engine
 * card holds the templates and sends them with the tab's one Save; its tests own that.
 */
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MessageTemplates } from "@/types";

const updateNotificationConfig = vi.fn();
vi.mock("@/api/notificationEngine", () => ({
  updateNotificationConfig: (...a: unknown[]) => updateNotificationConfig(...a),
}));

const previewTemplate = vi.fn();
vi.mock("@/api/templatePreview", () => ({
  previewTemplate: (...a: unknown[]) => previewTemplate(...a),
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
import { waitFor } from "@testing-library/react";
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

// Mirrors how NotificationsEngineSection wires it: `onChange` feeds back into `templates`.
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

describe("MessageTemplatesSection — controlled (settings.explicit-save, PAD-506)", () => {
  it("shows the templates it is given", () => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    expect(reminderTextarea().value).toBe("reminder {name}");
  });

  it("an edit is handed to onChange with the other templates intact, and sends nothing itself", () => {
    const onChange = vi.fn();
    render(
      <SettingsUnsavedTestHarness>
        <MessageTemplatesSection templates={TEMPLATES} onChange={onChange} />
      </SettingsUnsavedTestHarness>
    );
    fireEvent.change(reminderTextarea(), { target: { value: "reminder {name} at {time}" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...TEMPLATES, reminder: "reminder {name} at {time}" });
    expect(updateNotificationConfig).not.toHaveBeenCalled();
  });

  it("the held value shows in the textarea; the section does not hold state of its own", () => {
    const onChange = vi.fn();
    render(
      <SettingsUnsavedTestHarness>
        <MessageTemplatesSection templates={TEMPLATES} onChange={onChange} />
      </SettingsUnsavedTestHarness>
    );
    fireEvent.change(reminderTextarea(), { target: { value: "typed" } });
    // controlled: the parent did not take the change, so the prop value still shows
    expect(reminderTextarea().value).toBe("reminder {name}");
  });

  it("has no Save button and reports nothing unsaved by itself (the engine card owns both)", () => {
    render(
      <SettingsUnsavedTestHarness>
        <Wrapper />
      </SettingsUnsavedTestHarness>
    );
    fireEvent.change(reminderTextarea(), { target: { value: "edited" } });
    expect(screen.queryByText("settings.templates.saveTemplates")).toBeNull();
    expect(unsavedIds()).toBe("");
    expect(updateNotificationConfig).not.toHaveBeenCalled();
  });
});

describe("MessageTemplatesSection — the waiting-list invitation (PAD-446, message-templates rules 2, 16)", () => {
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


describe("MessageTemplatesSection explains templates and previews them (PAD-549)", () => {
  beforeEach(() => {
    previewTemplate.mockReset().mockImplementation(async (template: string) => ({
      text: template.replace("{day}", "amanhã").replace("{name}", "Ana"),
      examples: { name: "Ana", day: "amanhã", date: "09/10" },
    }));
  });

  it("lists every field with its meaning and the server's example", async () => {
    render(<Wrapper />);
    expect(screen.getByTestId("template-help-field-day").textContent).toContain("settings.templates.help.fields.day");
    await waitFor(() => expect(screen.getByTestId("template-help-example-day").textContent).toBe("amanhã"));
    expect(screen.getByTestId("template-help-example-court").textContent).toBe("—");
  });

  it("offers {day} on the class templates", () => {
    render(<Wrapper />);
    expect(within(screen.getByTestId("template-row-invite")).getByText("{day}")).toBeTruthy();
  });

  it("previews a class template through the server's formatter", async () => {
    render(<Wrapper />);
    const row = screen.getByTestId("template-row-invite");
    fireEvent.change(within(row).getByRole("textbox"), { target: { value: "vaga para {day}, {name}" } });
    await waitFor(() =>
      expect(screen.getByTestId("template-preview-invite").textContent).toContain("vaga para amanhã, Ana"),
      { timeout: 2000 }
    );
    expect(previewTemplate).toHaveBeenCalledWith("vaga para {day}, {name}");
  });
});
