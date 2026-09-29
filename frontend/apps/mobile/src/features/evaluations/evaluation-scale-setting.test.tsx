/**
 * evaluations.scale rules 1 and 8 (PAD-423), iOS twin of the web setting test. The hooks are
 * shimmed (the mobile harness cannot mount react-query: two React copies), so the test drives
 * what the component does with the server value and with a save that succeeds or fails.
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const hooks = vi.hoisted(() => ({
  data: undefined as { scaleMax: number } | undefined,
  mutateAsync: vi.fn(),
}));
vi.mock("@levelup/hooks", () => ({
  useEvaluationScale: () => ({ data: hooks.data, isLoading: false }),
  useSaveEvaluationScale: () => ({ mutateAsync: hooks.mutateAsync }),
}));

import { EvaluationScaleSetting } from "./evaluation-scale-setting";

const checked = (n: Awaited<ReturnType<typeof renderNative>>, scale: number) =>
  n.byTestId(`settings-evaluation-scale-option-${scale}`).props.accessibilityState.checked;

afterEach(() => { hooks.data = undefined; hooks.mutateAsync.mockReset(); });

describe("Escala de avaliações (iOS)", () => {
  it("shows the server's scale", async () => {
    hooks.data = { scaleMax: 5 };
    const n = await renderNative(<EvaluationScaleSetting />);
    expect(checked(n, 5)).toBe(true);
    for (const s of [10, 20, 100]) expect(checked(n, s)).toBe(false);
  });

  it("choosing 1-10 saves {scaleMax: 10} at once", async () => {
    hooks.data = { scaleMax: 5 };
    hooks.mutateAsync.mockResolvedValue({ scaleMax: 10 });
    const n = await renderNative(<EvaluationScaleSetting />);

    await n.press("settings-evaluation-scale-option-10");
    await n.flush();

    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ scaleMax: 10 });
    expect(checked(n, 10)).toBe(true);
  });

  it("a failed save puts the previous choice back and says so", async () => {
    hooks.data = { scaleMax: 20 };
    hooks.mutateAsync.mockRejectedValue(new Error("offline"));
    const n = await renderNative(<EvaluationScaleSetting />);

    await n.press("settings-evaluation-scale-option-100");
    await n.flush();

    expect(checked(n, 20)).toBe(true);
    expect(n.queryByTestId("settings-evaluation-scale-error")).not.toBeNull();
  });
});
