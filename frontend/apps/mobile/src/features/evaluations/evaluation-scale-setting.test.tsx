/**
 * evaluations.scale rules 1 and 8 (PAD-423), iOS twin of the web setting test. settings.explicit-save
 * (PAD-506): a choice is held until the screen's one Save (SectionSaveProbe). The hooks are shimmed
 * (the mobile harness cannot mount react-query: two React copies).
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider, useUnsavedRegistry } from "@/features/settings/unsaved-registry";

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

let registry!: ReturnType<typeof useUnsavedRegistry>;
function Capture() {
  registry = useUnsavedRegistry();
  return null;
}
const mount = () =>
  renderNative(
    <UnsavedRegistryProvider>
      <Capture />
      <EvaluationScaleSetting />
      <SectionSaveProbe testID="save" />
    </UnsavedRegistryProvider>,
  );

describe("Escala de avaliações (iOS)", () => {
  it("shows the server's scale", async () => {
    hooks.data = { scaleMax: 5 };
    const n = await mount();
    expect(checked(n, 5)).toBe(true);
    for (const s of [10, 20, 100]) expect(checked(n, s)).toBe(false);
  });

  it("choosing 1-10 is held; the Save sends {scaleMax: 10} once", async () => {
    hooks.data = { scaleMax: 5 };
    hooks.mutateAsync.mockResolvedValue({ scaleMax: 10 });
    const n = await mount();

    await n.press("settings-evaluation-scale-option-10");
    await n.flush();
    expect(checked(n, 10)).toBe(true);
    expect(hooks.mutateAsync).not.toHaveBeenCalled();
    expect(registry.hasUnsaved()).toBe(true);

    await n.press("save");
    await n.flush();
    expect(hooks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ scaleMax: 10 });
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("a failed Save keeps the choice held and unsaved", async () => {
    hooks.data = { scaleMax: 20 };
    hooks.mutateAsync.mockRejectedValue(new Error("offline"));
    const n = await mount();

    await n.press("settings-evaluation-scale-option-100");
    await n.press("save");
    await n.flush();

    expect(checked(n, 100)).toBe(true);
    expect(registry.hasUnsaved()).toBe(true);
  });

  it("choosing a scale and back is clean", async () => {
    hooks.data = { scaleMax: 5 };
    const n = await mount();

    await n.press("settings-evaluation-scale-option-10");
    await n.press("settings-evaluation-scale-option-5");
    await n.flush();

    expect(registry.hasUnsaved()).toBe(false);
  });
});
