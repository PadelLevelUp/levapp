/**
 * evaluations.reminders rules 1, 2, 7, 8 (PAD-404) — "Frequência de avaliações" on web.
 * Asserted by test id, never by rendered copy (t is mocked to return the key).
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { CUSTOM_SAVE_DELAY_MS, EvaluationReminderSetting } from "./EvaluationReminderSetting";

function open(data: EvaluationSettings) {
  api.getEvaluationSettings.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
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

    await waitFor(() =>
      expect(screen.getByTestId("settings-evaluation-reminder-sign")).toHaveAttribute("data-state", "failed"),
    );
    expect(screen.getByTestId("settings-evaluation-reminder-option-never")).toBeChecked();
    expect(screen.getByTestId("settings-evaluation-reminder-option-monthly")).not.toBeChecked();
  });
});

describe("Personalizado saves a typed number however the coach leaves it (B-242)", () => {
  // Fake timers once the field is on screen: the delay, the flush and the duplicate check are
  // asserted at exact times, so a 0 ms delay or a save that waits for a timer cannot pass.
  async function typedField(stored = 7) {
    api.putEvaluationSettings.mockImplementation(async (body: EvaluationSettings) => body);
    const view = open({ reminder: "every_n_classes", everyN: stored });
    const input = await screen.findByTestId("settings-evaluation-reminder-n");
    vi.useFakeTimers();
    return { view, input };
  }
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  afterEach(() => vi.useRealTimers());

  it("saves once, shortly after typing stops, without a blur", async () => {
    const { input } = await typedField();

    fireEvent.change(input, { target: { value: "1" } });
    await advance(300);
    fireEvent.change(input, { target: { value: "12" } });
    await advance(CUSTOM_SAVE_DELAY_MS - 100);
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();

    await advance(150);
    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
    expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 12 });
  });

  it("a blur after the delayed save sends nothing a second time", async () => {
    const { input } = await typedField();

    fireEvent.change(input, { target: { value: "9" } });
    await advance(CUSTOM_SAVE_DELAY_MS + 50);
    fireEvent.blur(input);
    await advance(CUSTOM_SAVE_DELAY_MS + 50);

    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
  });

  it("leaving the screen sends a number still waiting for its delay, at once", async () => {
    const { view, input } = await typedField();

    fireEvent.change(input, { target: { value: "8" } });
    view.unmount();
    await advance(0);

    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
    expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 8 });
  });

  it.each(["0", "100", "1.5", ""])("%j is never sent, by the delay or by leaving", async (typed) => {
    const { view, input } = await typedField();

    fireEvent.change(input, { target: { value: typed } });
    await advance(CUSTOM_SAVE_DELAY_MS + 50);
    view.unmount();
    await advance(0);

    expect(api.putEvaluationSettings).not.toHaveBeenCalled();
  });

  it("choosing a radio option drops a number still waiting for its delay", async () => {
    const { input } = await typedField();

    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("settings-evaluation-reminder-option-monthly"));
    await advance(CUSTOM_SAVE_DELAY_MS + 50);

    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
    expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "monthly" });
  });

  it("retyping the stored number after an invalid one clears the error and sends nothing", async () => {
    const { input } = await typedField(7);

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("settings-evaluation-reminder-error")).toHaveTextContent("evaluations.reminder.invalidNumber");

    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);
    await advance(CUSTOM_SAVE_DELAY_MS + 50);

    expect(screen.queryByTestId("settings-evaluation-reminder-error")).toBeNull();
    expect(api.putEvaluationSettings).not.toHaveBeenCalled();
  });

  it("the page going away sends a number still waiting for its delay, with keepalive", async () => {
    const { input } = await typedField();

    fireEvent.change(input, { target: { value: "8" } });
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await advance(0);

    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
    expect(api.putEvaluationSettings).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 8 }, { keepalive: true });
    await advance(CUSTOM_SAVE_DELAY_MS + 50);
    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
  });

  it("the page going away with nothing pending sends nothing", async () => {
    await typedField();

    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await advance(CUSTOM_SAVE_DELAY_MS + 50);

    expect(api.putEvaluationSettings).not.toHaveBeenCalled();
  });

describe("review #497", () => {
  const pastDelay = CUSTOM_SAVE_DELAY_MS + 50;
  afterEach(() => vi.useRealTimers());

  async function field(stored = 7) {
    api.putEvaluationSettings.mockImplementation(async (body: EvaluationSettings) => body);
    open({ reminder: "every_n_classes", everyN: stored });
    const input = await screen.findByTestId("settings-evaluation-reminder-n");
    vi.useFakeTimers();
    return input;
  }
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

  it("item 7: a failure landing while a newer number is being typed does not reset it; the newer number is saved", async () => {
    const input = await field(7);
    let fail8!: (e: Error) => void;
    api.putEvaluationSettings.mockImplementationOnce(() => new Promise((_r, rej) => { fail8 = rej; }));

    fireEvent.change(input, { target: { value: "8" } });
    await advance(pastDelay); // 8 sent, held
    fireEvent.change(input, { target: { value: "9" } }); // waiting for its delay
    await act(async () => { fail8(new Error("offline")); });
    expect(input).toHaveValue(9);

    await advance(pastDelay);
    expect(api.putEvaluationSettings).toHaveBeenLastCalledWith({ reminder: "every_n_classes", everyN: 9 });
  });

  it("rule 2: typing gives one sign, after typing stops (counted by signs shown)", async () => {
    const input = await field(7);
    const states: string[] = [];
    const sample = () => states.push(screen.getByTestId("settings-evaluation-reminder-sign").getAttribute("data-state") ?? "");

    fireEvent.change(input, { target: { value: "1" } });
    for (let i = 0; i < 3; i++) { await advance(100); sample(); }
    fireEvent.change(input, { target: { value: "12" } });
    for (let i = 0; i < 40; i++) { await advance(100); sample(); }

    const rises = states.filter((st, i) => st === "saved" && states[i - 1] !== "saved").length;
    expect(rises).toBe(1);
    expect(api.putEvaluationSettings).toHaveBeenCalledTimes(1);
  });
});
});
