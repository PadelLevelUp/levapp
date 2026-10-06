/**
 * settings.explicit-save (PAD-506) on the iOS engine card, the twin of web's NotificationsEngineSection
 * test: every control's change is held; the screen's one Save (stood in for by SectionSaveProbe) sends
 * one PATCH with what changed; a failure keeps the edit held and unsaved. Sub-panels are stubs.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider, useUnsavedRegistry } from "./unsaved-registry";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@levelup/api", () => ({ notificationEngineApi: api }));

const clicks = vi.hoisted(() => ({ n: 0 }));
vi.mock("./eligibility-section", async () => {
  const { Pressable } = await import("react-native");
  return {
    EligibilitySection: (p: { onChange: (v: unknown) => void }) =>
      React.createElement(Pressable, { testID: "stub-eligibility-change", onPress: () => p.onChange([{ attribute: "level" }]) }),
  };
});
vi.mock("./eligibility-impact-note", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./restrictions-section", async () => {
  const { Pressable, Text, View } = await import("react-native");
  return {
    RestrictionsSection: (p: { restrictions: unknown; onChange: (v: unknown) => void }) =>
      React.createElement(View, null,
        React.createElement(Text, { testID: "stub-restrictions-value" }, JSON.stringify(p.restrictions)),
        React.createElement(Pressable, {
          testID: "stub-restrictions-change",
          onPress: () => p.onChange({ cancellationDeadlineHours: 12 + ++clicks.n }),
        }),
      ),
  };
});

import { AutoInviteSection } from "./auto-invite-section";

const CONFIG = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  eligibilityRules: null,
  restrictions: {},
};

type N = Awaited<ReturnType<typeof renderNative>>;
const on = (n: N, id: string) => n.byTestId(id).props.accessibilityState?.checked ?? n.byTestId(id).props["aria-checked"] ?? n.byTestId(id).props.checked;
const restrictionsShown = (n: N) => n.byTestId("stub-restrictions-value").props.children as string;

beforeEach(() => {
  clicks.n = 0;
  __resetReactNativeMock();
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
});

let registry!: ReturnType<typeof useUnsavedRegistry>;
function Capture() {
  registry = useUnsavedRegistry();
  return null;
}

async function mount() {
  const n = await renderNative(
    <UnsavedRegistryProvider>
      <Capture />
      <AutoInviteSection />
      <SectionSaveProbe testID="settings-engine-save" />
    </UnsavedRegistryProvider>,
  );
  await n.flush();
  return n;
}
const save = async (n: N) => {
  await n.press("settings-engine-save");
  await n.flush();
};

describe("iOS engine card waits for the one Save (settings.explicit-save)", () => {
  it("the master toggle is held: nothing is sent until Save, then one PATCH and clean", async () => {
    const n = await mount();
    await n.toggle("settings-auto-invite-toggle");
    await n.flush();
    expect(on(n, "settings-auto-invite-toggle")).toBe(false);
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(registry.hasUnsaved()).toBe(true);

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ autoNotifyEnabled: false });
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("eligibility, invitation mode, open spots and restrictions go in one PATCH", async () => {
    const n = await mount();
    await n.press("stub-eligibility-change");
    await n.press("settings-invite-mode-semi");
    await n.toggle("open-spots-visible");
    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change");
    await n.flush();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({
      invitationMode: "semi_automatic",
      eligibilityRules: [{ attribute: "level" }],
      openSpotsVisible: true,
      restrictions: { cancellationDeadlineHours: 13 },
    });
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("a failed Save keeps the edit held and unsaved; the next Save sends it again", async () => {
    const n = await mount();
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));
    await n.toggle("open-spots-visible");
    await n.flush();

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    expect(on(n, "open-spots-visible")).toBe(true);
    expect(registry.hasUnsaved()).toBe(true);

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2);
    expect(api.updateNotificationConfig).toHaveBeenLastCalledWith({ openSpotsVisible: true });
    expect(registry.hasUnsaved()).toBe(false);
  });

  it("changing a control and changing it back is clean and sends nothing", async () => {
    const n = await mount();
    await n.toggle("open-spots-visible");
    await n.flush();
    expect(registry.hasUnsaved()).toBe(true);
    await n.toggle("open-spots-visible");
    await n.flush();
    expect(registry.hasUnsaved()).toBe(false);

    await save(n);
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
  });

  it("successive changes to one control send only the last value", async () => {
    const n = await mount();
    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change"); // 13
    await n.press("stub-restrictions-change"); // 14
    await n.flush();
    expect(restrictionsShown(n)).toContain('"cancellationDeadlineHours":14');

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ restrictions: { cancellationDeadlineHours: 14 } });
  });

  it("after a Save the server's confirmed value is what the card shows", async () => {
    const n = await mount();
    api.updateNotificationConfig.mockResolvedValueOnce({ ...CONFIG, restrictions: { cancellationDeadlineHours: 7 } });
    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change");
    await n.flush();

    await save(n);
    expect(restrictionsShown(n)).toContain('"cancellationDeadlineHours":7');
    expect(registry.hasUnsaved()).toBe(false);
  });
});
