/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — "Frequência de avaliações" on web.
 * Asserted by test id, never by rendered copy (t is mocked to return the key).
 */
import * as React from "react";
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

function open(data: EvaluationSettings) {
  api.getEvaluationSettings.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EvaluationReminderSetting />
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

describe("saving on change (rule 1)", () => {
  it("choosing monthly saves exactly {reminder: 'monthly'}", async () => {
    api.putEvaluationSettings.mockResolvedValue({ reminder: "monthly" });
    open({ reminder: "never" });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-never")).toBeChecked());

    fireEvent.click(screen.getByTestId("settings-evaluation-reminder-option-monthly"));

    await waitFor(() => expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "monthly" }));
  });

  it("choosing every_2 saves {reminder: 'every_n_classes', everyN: 2}", async () => {
    api.putEvaluationSettings.mockResolvedValue({ reminder: "every_n_classes", everyN: 2 });
    open({ reminder: "never" });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-never")).toBeChecked());

    fireEvent.click(screen.getByTestId("settings-evaluation-reminder-option-every_2"));

    await waitFor(() =>
      expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 2 }),
    );
  });
});

describe("the custom number (rule 8)", () => {
  it("0 or 100 does not save and shows the inline error", async () => {
    open({ reminder: "every_n_classes", everyN: 7 });
    const input = await screen.findByTestId("settings-evaluation-reminder-n");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(await screen.findByTestId("settings-evaluation-reminder-error")).toHaveTextContent(
      "evaluations.reminder.invalidNumber",
    );
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.blur(input);
    expect(await screen.findByTestId("settings-evaluation-reminder-error")).toHaveTextContent(
      "evaluations.reminder.invalidNumber",
    );
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();
  });

  it("6 + blur saves {reminder: 'every_n_classes', everyN: 6}", async () => {
    api.putEvaluationSettings.mockResolvedValue({ reminder: "every_n_classes", everyN: 6 });
    open({ reminder: "every_n_classes", everyN: 7 });
    const input = await screen.findByTestId("settings-evaluation-reminder-n");

    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 6 }),
    );
    expect(screen.queryByTestId("settings-evaluation-reminder-error")).toBeNull();
  });
});

describe("the control never shows a choice the server does not hold", () => {
  it("choosing custom saves every_n_classes at 4 at once", async () => {
    api.putEvaluationSettings.mockResolvedValue({ reminder: "every_n_classes", everyN: 4 });
    open({ reminder: "monthly" });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-monthly")).toBeChecked());

    fireEvent.click(screen.getByTestId("settings-evaluation-reminder-option-custom"));

    await waitFor(() =>
      expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 4 }),
    );
    expect(screen.getByTestId("settings-evaluation-reminder-n")).toHaveValue(4);
  });

  it("a failed save puts the previous choice back and says so", async () => {
    api.putEvaluationSettings.mockRejectedValue(new Error("offline"));
    open({ reminder: "never" });
    await waitFor(() => expect(screen.getByTestId("settings-evaluation-reminder-option-never")).toBeChecked());

    fireEvent.click(screen.getByTestId("settings-evaluation-reminder-option-monthly"));

    expect(await screen.findByTestId("settings-evaluation-reminder-error")).toHaveTextContent(
      "evaluations.reminder.saveFailed",
    );
    expect(screen.getByTestId("settings-evaluation-reminder-option-never")).toBeChecked();
    expect(screen.getByTestId("settings-evaluation-reminder-option-monthly")).not.toBeChecked();
  });
});
