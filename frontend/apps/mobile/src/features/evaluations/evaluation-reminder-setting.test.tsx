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
const waitPastDelay = () => act(async () => { await new Promise((r) => setTimeout(r, CUSTOM_SAVE_DELAY_MS + 50)); });

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
    await n.changeText(FIELD, "12");
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

  it("an invalid number is never sent, by the delay or by leaving", async () => {
    const n = await openCustom();

    await n.changeText(FIELD, "0");
    await waitPastDelay();
    await act(async () => { __emitAppState("background"); });
    await act(async () => { n.root.unmount(); });

    expect(hooks.mutateAsync).not.toHaveBeenCalled();
  });

  it("after a failed save the same number is sent again on blur", async () => {
    const n = await openCustom();
    hooks.mutateAsync.mockRejectedValueOnce(new Error("offline"));

    await n.changeText(FIELD, "5");
    await waitPastDelay();
    await n.flush();
    expect(n.queryByTestId("settings-evaluation-reminder-error")).not.toBeNull();

    await act(async () => { n.byTestId(FIELD).props.onBlur(); });
    expect(hooks.mutateAsync).toHaveBeenCalledTimes(2);
    expect(hooks.mutateAsync).toHaveBeenLastCalledWith({ reminder: "every_n_classes", everyN: 5 });
  });
});
