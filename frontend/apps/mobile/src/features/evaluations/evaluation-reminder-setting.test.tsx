/**
 * B-242 (PAD-473), evaluations.reminders rule 1 — the iOS "Personalizado" number is saved however the
 * coach leaves it, not only on blur: the number pad has no Return key, so a number left in a focused
 * field was lost when the app went to the background or a link took the coach elsewhere. The hooks
 * are shimmed (the mobile harness cannot mount react-query: two React copies).
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __emitAppState, __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const hooks = vi.hoisted(() => ({
  data: undefined as { reminder: string; everyN?: number } | undefined,
  mutateAsync: vi.fn(),
}));
vi.mock("@levelup/hooks", () => ({
  useEvaluationSettings: () => ({ data: hooks.data, isLoading: false }),
  useSaveEvaluationSettings: () => ({ mutateAsync: hooks.mutateAsync }),
}));

import { CUSTOM_SAVE_DELAY_MS, EvaluationReminderSetting } from "./evaluation-reminder-setting";

const FIELD = "settings-evaluation-reminder-n";
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const waitPastDelay = () => wait(CUSTOM_SAVE_DELAY_MS + 50);
const signText = (n: Awaited<ReturnType<typeof renderNative>>, id: string) =>
  n.byTestId(id).findAll((x) => typeof x.props.children === "string").map((x) => x.props.children).join("");

afterEach(() => {
  hooks.data = undefined;
  hooks.mutateAsync.mockReset();
  __resetReactNativeMock();
});

async function openCustom(everyN = 7) {
  hooks.data = { reminder: "every_n_classes", everyN };
  hooks.mutateAsync.mockImplementation(async (body: unknown) => body);
  return renderNative(<EvaluationReminderSetting />);
}

describe("Personalizado saves a typed number however the coach leaves it (B-242)", () => {
  it("saves once, shortly after typing stops, without a blur", async () => {
    const n = await openCustom();

    await n.changeText(FIELD, "1");
    await wait(300);
    await n.changeText(FIELD, "12");
    await wait(CUSTOM_SAVE_DELAY_MS - 150);
    expect(hooks.mutateAsync).not.toHaveBeenCalled();

    await waitPastDelay();
    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 12 });
  });

  it("a blur after the delayed save sends nothing a second time", async () => {
    const n = await openCustom();

    await n.changeText(FIELD, "9");
    await waitPastDelay();
    await act(async () => { n.byTestId(FIELD).props.onBlur(); });

    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("the app leaving the foreground sends a number still waiting for its delay", async () => {
    const n = await openCustom();

    await n.changeText(FIELD, "9");
    await act(async () => { __emitAppState("background"); });

    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 9 });
    await waitPastDelay();
    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("leaving the screen sends a number still waiting for its delay", async () => {
    const n = await openCustom();

    await n.changeText(FIELD, "8");
    await act(async () => { n.root.unmount(); });

    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 8 });
  });

  it.each(["0", "100", "1.5", ""])("%j is never sent, by the delay or by leaving", async (typed) => {
    const n = await openCustom();

    await n.changeText(FIELD, typed);
    await waitPastDelay();
    await act(async () => { __emitAppState("background"); });
    await act(async () => { n.root.unmount(); });

    expect(hooks.mutateAsync).not.toHaveBeenCalled();
  });

  it("a failed save says so, returns the field to the confirmed number, and the same number can be sent again", async () => {
    const n = await openCustom();
    hooks.mutateAsync.mockRejectedValueOnce(new Error("offline"));

    await n.changeText(FIELD, "5");
    await waitPastDelay();
    await n.flush();
    expect(signText(n, "settings-evaluation-reminder-sign")).toContain("settings.saveSign.failed");
    expect(n.byTestId(FIELD).props.value).toBe("7");

    await n.changeText(FIELD, "5");
    await act(async () => { n.byTestId(FIELD).props.onBlur(); });
    expect(hooks.mutateAsync).toHaveBeenCalledTimes(2);
    expect(hooks.mutateAsync).toHaveBeenLastCalledWith({ reminder: "every_n_classes", everyN: 5 });
  });

  it("choosing a radio option drops a number still waiting for its delay", async () => {
    const n = await openCustom();

    await n.changeText(FIELD, "9");
    await n.press("settings-evaluation-reminder-option-monthly");
    await waitPastDelay();

    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ reminder: "monthly" });
  });

  it("retyping the stored number after an invalid one clears the error and sends nothing", async () => {
    const n = await openCustom(7);

    await n.changeText(FIELD, "0");
    await act(async () => { n.byTestId(FIELD).props.onBlur(); });
    expect(n.queryByTestId("settings-evaluation-reminder-error")).not.toBeNull();

    await n.changeText(FIELD, "7");
    await act(async () => { n.byTestId(FIELD).props.onBlur(); });
    await waitPastDelay();

    expect(n.queryByTestId("settings-evaluation-reminder-error")).toBeNull();
    expect(hooks.mutateAsync).not.toHaveBeenCalled();
  });

  it("review #497 item 7: a failure landing while a newer number is being typed does not reset it; the newer number is saved", async () => {
    const n = await openCustom(7);
    let fail8!: (e: Error) => void;
    hooks.mutateAsync.mockImplementationOnce(() => new Promise((_r, rej) => { fail8 = rej; }));

    await n.changeText(FIELD, "8");
    await waitPastDelay(); // 8 sent, held
    await n.changeText(FIELD, "9"); // waiting for its delay
    await act(async () => { fail8(new Error("offline")); });
    expect(n.byTestId(FIELD).props.value).toBe("9");

    await waitPastDelay();
    expect(hooks.mutateAsync).toHaveBeenLastCalledWith({ reminder: "every_n_classes", everyN: 9 });
  });

  it("rule 3: two held frequency saves both fail — back to the confirmed frequency", async () => {
    hooks.data = { reminder: "never" };
    let failY!: (e: Error) => void;
    let failZ!: (e: Error) => void;
    hooks.mutateAsync
      .mockImplementationOnce(() => new Promise((_r, rej) => { failY = rej; }))
      .mockImplementationOnce(() => new Promise((_r, rej) => { failZ = rej; }));
    const n = await renderNative(<EvaluationReminderSetting />);

    await n.press("settings-evaluation-reminder-option-monthly"); // Y
    await n.press("settings-evaluation-reminder-option-every_2"); // Z, started from monthly
    await act(async () => { failY(new Error("y")); });
    await act(async () => { failZ(new Error("z")); });
    await n.flush();

    expect(n.byTestId("settings-evaluation-reminder-option-never").props.accessibilityState.checked).toBe(true);
  });
});
