/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — "Frequência de avaliações" on web.
 * settings.explicit-save (PAD-506): a choice and a typed number are held until the tab's one Save
 * (the harness's `harness-save` stands in for the page's). Asserted by test id, never by rendered
 * copy (t is mocked to return the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvaluationSettings } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));

const api = vi.hoisted(() => ({
  getEvaluationSettings: vi.fn(),
  putEvaluationSettings: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/evaluationSettings", () => api);

import { EvaluationReminderSetting } from "./EvaluationReminderSetting";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

function open(data: EvaluationSettings) {
  api.getEvaluationSettings.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsUnsavedTestHarness>
        <EvaluationReminderSetting />
      </SettingsUnsavedTestHarness>
    </QueryClientProvider>,
  );
}

afterEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("what the control shows from the server value (rules 1, 7)", () => {
  it("selects never for {reminder: 'never'}", async () => {
    open({ reminder: "never" });

    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-never")).toBeChecked());
    expect(screen.getByTestId("settings-evaluation-reminder-option-monthly")).not.toBeChecked();
    expect(screen.queryByTestId("settings-evaluation-reminder-n")).toBeNull();
  });

  it("selects every_4 for everyN 4, and custom showing the number for everyN 7", async () => {
    open({ reminder: "every_n_classes", everyN: 4 });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-every_4")).toBeChecked());
    expect(screen.queryByTestId("settings-evaluation-reminder-n")).toBeNull();
  });

  it("everyN 7 selects custom, showing 7", async () => {
    open({ reminder: "every_n_classes", everyN: 7 });

    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-custom")).toBeChecked());
    expect(screen.getByTestId("settings-evaluation-reminder-n")).toHaveValue(7);
  });
});

const option = (o: string) => screen.getByTestId(`settings-evaluation-reminder-option-${o}`);
const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;
const save = () => fireEvent.click(screen.getByTestId("harness-save"));

async function openOn(data: EvaluationSettings, checked: string) {
  open(data);
  await waitFor(() => expect(option(checked)).toBeChecked());
}

describe("held until the tab's Save (settings.explicit-save rules 2-3)", () => {
  it("choosing monthly sends nothing, and the Save sends exactly {reminder: 'monthly'}", async () => {
    api.putEvaluationSettings.mockImplementation(async (body: unknown) => body);
    await openOn({ reminder: "never" }, "never");

    fireEvent.click(option("monthly"));
    expect(option("monthly")).toBeChecked();
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();
    expect(unsavedIds()).toBe("evaluationReminder");

    save();
    await waitFor(() => expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "monthly" }));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("every_2 is saved as {reminder: 'every_n_classes', everyN: 2}", async () => {
    api.putEvaluationSettings.mockImplementation(async (body: unknown) => body);
    await openOn({ reminder: "never" }, "never");

    fireEvent.click(option("every_2"));
    save();

    await waitFor(() =>
      expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 2 }),
    );
  });

  it("choosing an option and back is clean (settings.unsaved-edits rule 2)", async () => {
    await openOn({ reminder: "never" }, "never");

    fireEvent.click(option("monthly"));
    fireEvent.click(option("never"));

    expect(unsavedIds()).toBe("");
  });

  it("a failed Save keeps the choice held and unsaved", async () => {
    api.putEvaluationSettings.mockRejectedValue(new Error("offline"));
    await openOn({ reminder: "never" }, "never");

    fireEvent.click(option("monthly"));
    save();

    await waitFor(() => expect(screen.getByTestId("save-failed")).toHaveTextContent("evaluationReminder"));
    expect(option("monthly")).toBeChecked();
    expect(unsavedIds()).toBe("evaluationReminder");
  });
});

describe("the custom number (rules 1, 8)", () => {
  it("Personalizado opens at 4, held; a typed 6 is what the Save sends", async () => {
    api.putEvaluationSettings.mockImplementation(async (body: unknown) => body);
    await openOn({ reminder: "never" }, "never");

    fireEvent.click(option("custom"));
    const field = screen.getByTestId("settings-evaluation-reminder-n");
    expect(field).toHaveValue(4);
    fireEvent.change(field, { target: { value: "6" } });
    fireEvent.blur(field);
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();

    save();
    await waitFor(() =>
      expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 6 }),
    );
  });

  it("0 or 100 shows the inline error on blur, and the Save refuses it without sending", async () => {
    await openOn({ reminder: "every_n_classes", everyN: 7 }, "custom");
    const field = screen.getByTestId("settings-evaluation-reminder-n");

    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    expect(screen.getByTestId("settings-evaluation-reminder-error")).toBeInTheDocument();

    fireEvent.change(field, { target: { value: "100" } });
    save();
    await waitFor(() => expect(screen.getByTestId("save-failed")).toHaveTextContent("evaluationReminder"));
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();
    expect(screen.getByTestId("settings-evaluation-reminder-error")).toBeInTheDocument();
  });

  it("retyping the stored number after an invalid one is clean and clears the error", async () => {
    await openOn({ reminder: "every_n_classes", everyN: 7 }, "custom");
    const field = screen.getByTestId("settings-evaluation-reminder-n");

    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.blur(field);
    fireEvent.change(field, { target: { value: "7" } });

    expect(screen.queryByTestId("settings-evaluation-reminder-error")).toBeNull();
    expect(unsavedIds()).toBe("");
  });
});
