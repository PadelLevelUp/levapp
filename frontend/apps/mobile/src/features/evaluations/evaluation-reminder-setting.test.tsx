/**
 * evaluations.reminders rules 1, 8 on iOS. settings.explicit-save (PAD-506): the choice and a typed
 * "Personalizado" number are held until the screen's one Save (SectionSaveProbe), which refuses an
 * invalid number in place. (B-242's save-after-typing / on-leave flushes belonged to the save-on-change
 * model PAD-506 replaced.) The hooks are shimmed (the mobile harness cannot mount react-query).
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider, useUnsavedRegistry } from "@/features/settings/unsaved-registry";

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

import { EvaluationReminderSetting } from "./evaluation-reminder-setting";

const FIELD = "settings-evaluation-reminder-n";
const option = (o: string) => `settings-evaluation-reminder-option-${o}`;

let registry!: ReturnType<typeof useUnsavedRegistry>;
function Capture() {
  registry = useUnsavedRegistry();
  return null;
}

afterEach(() => {
  hooks.data = undefined;
  hooks.mutateAsync.mockReset();
  __resetReactNativeMock();
});

async function open(data: { reminder: string; everyN?: number }) {
  hooks.data = data;
  hooks.mutateAsync.mockImplementation(async (body: unknown) => body);
  const n = await renderNative(
    <UnsavedRegistryProvider>
      <Capture />
      <EvaluationReminderSetting />
      <SectionSaveProbe testID="save" />
    </UnsavedRegistryProvider>,
  );
  await n.flush();
  return n;
}

describe("held until the one Save (settings.explicit-save)", () => {
  it("choosing monthly sends nothing; the Save sends {reminder: 'monthly'} and the section is clean", async () => {
    const n = await open({ reminder: "never" });

    await n.press(option("monthly"));
    await n.flush();
    expect(n.byTestId(option("monthly")).props.accessibilityState.checked).toBe(true);
    expect(hooks.mutateAsync).not.toHaveBeenCalled();
    expect(registry.hasUnsaved()).toBe(true);

    await n.press("save");
    await n.flush();
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ reminder: "monthly" });
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("a typed custom number is held; the Save sends it", async () => {
    const n = await open({ reminder: "every_n_classes", everyN: 7 });

    await n.changeText(FIELD, "9");
    await n.flush();
    expect(hooks.mutateAsync).not.toHaveBeenCalled();
    expect(registry.hasUnsaved()).toBe(true);

    await n.press("save");
    await n.flush();
    expect(hooks.mutateAsync).toHaveBeenCalledWith({ reminder: "every_n_classes", everyN: 9 });
  });

  it("an invalid number is refused in place by the Save, nothing is sent, and it stays unsaved", async () => {
    const n = await open({ reminder: "every_n_classes", everyN: 7 });

    await n.changeText(FIELD, "0");
    await n.press("save");
    await n.flush();

    expect(hooks.mutateAsync).not.toHaveBeenCalled();
    expect(n.queryByTestId("settings-evaluation-reminder-error")).not.toBeNull();
    expect(registry.hasUnsaved()).toBe(true);
  });

  it("retyping the stored number after an invalid one is clean and clears the error", async () => {
    const n = await open({ reminder: "every_n_classes", everyN: 7 });

    await n.changeText(FIELD, "0");
    await n.changeText(FIELD, "7");
    await n.flush();

    expect(n.queryByTestId("settings-evaluation-reminder-error")).toBeNull();
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("a failed Save keeps the choice held and unsaved", async () => {
    const n = await open({ reminder: "never" });
    hooks.mutateAsync.mockRejectedValue(new Error("offline"));

    await n.press(option("monthly"));
    await n.press("save");
    await n.flush();

    expect(n.byTestId(option("monthly")).props.accessibilityState.checked).toBe(true);
    expect(registry.hasUnsaved()).toBe(true);
  });
});
