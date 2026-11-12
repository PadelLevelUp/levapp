/**
 * PAD-920 (notifications.config rule 20) on the iOS engine card: a coach on the new engine sees M, the
 * timing method and the pair (from ENGINE_T_FLOOR), the two toggles and the tiers editor; the screen's
 * one Save sends the `engine` and `invitationGroups` keys; a coach on the old engine sees today's screen.
 * The sub-panels the card already had are stubs, as in auto-invite-section.test.tsx.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_T_FLOOR } from "@levelup/config";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider } from "./unsaved-registry";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@levelup/api", () => ({ notificationEngineApi: api }));

vi.mock("./eligibility-section", () => ({ EligibilitySection: () => null }));
vi.mock("./eligibility-impact-note", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./restrictions-section", () => ({ RestrictionsSection: () => null }));
vi.mock("@/components/ui/time-picker-input", () => ({ TimePickerInput: () => null }));
// A stand-in keeping the contract the editor relies on (value in, onValueChange({value}) out), as
// eligibility-section.test.tsx does: the real Select is a portal the test renderer cannot open.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const { Pressable, Text, View } = await import("react-native");
  type Opt = { value: string; label: string };
  const Ctx = React.createContext<{ value?: Opt; onValueChange?: (o: Opt) => void }>({});
  return {
    Select: ({ value, onValueChange, children }: { value?: Opt; onValueChange?: (o: Opt) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: ({ testID, children }: { testID?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(View, { testID, accessibilityValue: { text: ctx.value?.value } }, children);
    },
    SelectValue: () => React.createElement(Text, null, React.useContext(Ctx).value?.value),
    SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    SelectItem: ({ value, label, testID }: Opt & { testID?: string }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(Pressable, { testID, onPress: () => ctx.onValueChange?.({ value, label }) });
    },
  };
});

import { AutoInviteSection } from "./auto-invite-section";

const GROUPS = [
  { id: "g1", rules: [{ attribute: "level", operation: "same_as_vacancy" }, { attribute: "side", operation: "same_as_vacancy" }] },
  { id: "g2", rules: [{ attribute: "level", operation: "one_above_vacancy" }] },
];
const BASE = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  eligibilityRules: null,
  restrictions: { maxInactiveTime: { enabled: true, value: 30 } },
  invitationGroups: GROUPS,
};
const NEW = { ...BASE, engineVersion: "new" };
const OLD = { ...BASE, engineVersion: "old" };

type N = Awaited<ReturnType<typeof renderNative>>;
const text = (n: N, id: string) => String(n.byTestId(id).props.children);
const sideOf = (n: N, tierIndex: number) => n.byTestId(`tier-side-${tierIndex}`).props.accessibilityValue.text;

async function mount(config: object) {
  api.getNotificationConfig.mockResolvedValue(config);
  const n = await renderNative(
    <UnsavedRegistryProvider>
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

beforeEach(() => {
  __resetReactNativeMock();
  api.getNotificationConfig.mockReset();
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...NEW, ...patch }));
});

describe("iOS Settings → Auto-Invite Engine on the new engine (notifications.config rule 20)", () => {
  it("[NOTIFICATIONS-CONFIG-72] shows the new engine's controls and the tiers editor to a coach on new only", async () => {
    // A coach on `old` sees today's screen: none of the new controls, no tiers editor.
    const old = await mount(OLD);
    for (const id of ["settings-engine-new", "engine-max-at-a-time-value", "engine-timing-method-fixed", "engine-auto-entry", "engine-side-choice", "settings-tiers-header", "tiers-editor"]) {
      expect(old.queryByTestId(id)).toBeNull();
    }
    old.root.unmount();

    const n = await mount(NEW);
    // M shows the engine's default; the pair falls back to maxInactiveTime (30) until stepped.
    expect(text(n, "engine-max-at-a-time-value")).toBe("12");
    expect(text(n, "engine-between-rounds-value")).toBe("30");
    expect(n.byTestId("engine-timing-method-fixed").props.accessibilityState.checked).toBe(true);

    // The steppers start at ENGINE_T_FLOOR (1 minute), not maxInactiveTime's 15.
    for (let i = 0; i < 40; i++) await n.press("engine-between-groups-dec");
    expect(text(n, "engine-between-groups-value")).toBe(String(ENGINE_T_FLOOR));
    expect(n.byTestId("engine-between-groups-dec").props.disabled).toBe(true);
    await n.press("engine-max-at-a-time-inc");
    await n.toggle("engine-auto-entry");
    await n.toggle("engine-side-choice");

    // The tiers editor: the two lists first and fixed, then the groups, each side rule offering
    // "Equilibrar lados da aula" and "Lado contrário".
    await n.press("settings-tiers-header");
    expect(n.byTestId("tiers-editor")).toBeTruthy();
    for (const fixed of [0, 1]) {
      expect(n.byTestId(`tier-row-${fixed}`)).toBeTruthy();
      expect(n.queryByTestId(`tier-remove-${fixed}`)).toBeNull();
      expect(n.queryByTestId(`tier-move-up-${fixed}`)).toBeNull();
    }
    expect(n.byTestId("tier-row-2")).toBeTruthy();
    expect(n.byTestId("tier-row-3")).toBeTruthy();
    // Every group can be removed, the last one too, as on web.
    expect(n.byTestId("tier-remove-2")).toBeTruthy();
    expect(n.byTestId("tier-remove-3")).toBeTruthy();
    expect(sideOf(n, 2)).toBe("same_as_vacancy");
    expect(n.byTestId("tier-side-2-same_as_vacancy")).toBeTruthy();
    await n.press("tier-side-2-different_from_vacancy");
    expect(sideOf(n, 2)).toBe("different_from_vacancy");
    await n.press("tier-add");
    expect(n.byTestId("tier-row-4")).toBeTruthy();
    await n.press("tier-move-up-3");

    // "Por grupo": a pair per tier, the fixed tiers included.
    await n.press("engine-timing-method-per_tier");
    expect(n.byTestId("tier-0-between-rounds-value")).toBeTruthy();
    await n.press("tier-0-between-rounds-dec");

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    const patch = api.updateNotificationConfig.mock.calls[0][0];
    expect(patch.engine).toEqual({
      maxAtATime: 13,
      timing: {
        method: "per_tier",
        betweenRoundsMinutes: null,
        betweenGroupsMinutes: ENGINE_T_FLOOR,
        perTier: [{ betweenRoundsMinutes: 29, betweenGroupsMinutes: null }, null, null, null, null],
      },
      autoEntryBeforeAttendanceRequest: true,
      waitingListSideChoice: true,
    });
    // The groups in their new order, the first with its side rule now "Lado contrário".
    expect(patch.invitationGroups.map((g: { id: string }) => g.id)).toEqual(["g2", "g1", expect.any(String)]);
    expect(patch.invitationGroups[1].rules[1]).toEqual({ attribute: "side", operation: "different_from_vacancy" });
  });
});
