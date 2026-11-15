/**
 * eligibility.rules rule 13 on the iOS engine card: the screen's one Save refuses a bar or group rule
 * that needs a value and has none. It sends nothing from the card, keeps every edit held, opens the
 * groups (the bar is not collapsible on iOS) and fails with a `SectionSaveError` whose reason names the
 * part; the screen's toast reads "<part> — <reason>" as web's (`failedPartText`), in the owner's words
 * read from the real pt locale. A stored blank rule in a part the coach did not touch never blocks.
 *
 * The bar and the tiers editor are stubs that set a blank or a filled rule; their own marking is in
 * eligibility-section.test.tsx and tiers-editor.blank-value.test.tsx.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider } from "./unsaved-registry";

const PT = JSON.parse(readFileSync(resolve(__dirname, "../../../../../src/locales/pt/settings.json"), "utf8"));
const pt = (key: string): string => {
  const v = key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);
  return typeof v === "string" ? v : key;
};
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: pt, i18n: { language: "pt" } }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@levelup/api", () => ({ notificationEngineApi: api }));

const BLANK_BAR = [{ attribute: "attendance_rate", operation: "greater_than" }];
const FILLED_BAR = [{ attribute: "attendance_rate", operation: "greater_than", value: 50 }];
const BLANK_GROUPS = [{ id: "g1", rules: [{ attribute: "justified_absences", operation: "less_than" }] }];
const FILLED_GROUPS = [{ id: "g1", rules: [{ attribute: "justified_absences", operation: "less_than", value: 2 }] }];

vi.mock("./eligibility-section", async () => {
  const React = await import("react");
  const { Pressable } = await import("react-native");
  return {
    EligibilitySection: ({ onChange }: { onChange: (v: unknown) => void }) =>
      React.createElement(React.Fragment, null,
        React.createElement(Pressable, { testID: "stub-bar-blank", onPress: () => onChange(BLANK_BAR) }),
        React.createElement(Pressable, { testID: "stub-bar-fill", onPress: () => onChange(FILLED_BAR) })),
  };
});
vi.mock("./tiers-editor", async () => {
  const React = await import("react");
  const { Pressable, View } = await import("react-native");
  type P = { engine: unknown; onChange: (v: { groups: unknown; engine: unknown }) => void };
  return {
    TiersEditor: ({ engine, onChange }: P) =>
      React.createElement(View, { testID: "stub-tiers" },
        React.createElement(Pressable, { testID: "stub-tiers-blank", onPress: () => onChange({ groups: BLANK_GROUPS, engine }) }),
        React.createElement(Pressable, { testID: "stub-tiers-fill", onPress: () => onChange({ groups: FILLED_GROUPS, engine }) })),
  };
});
vi.mock("./eligibility-impact-note", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./restrictions-section", () => ({ RestrictionsSection: () => null }));
vi.mock("@/components/ui/time-picker-input", () => ({ TimePickerInput: () => null }));

import { AutoInviteSection } from "./auto-invite-section";

const SETTINGS_SCREEN = readFileSync(resolve(__dirname, "../../..", "app/settings.tsx"), "utf8");

const BASE = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  eligibilityRules: null,
  restrictions: { maxInactiveTime: { enabled: true, value: 30 } },
  invitationGroups: [{ id: "g0", rules: [{ attribute: "level", operation: "same_as_vacancy" }] }],
  engineVersion: "new",
};
const TITLE = pt("settings.engine.title");
const BAR_REASON = "Elegibilidade: há uma regra sem valor.";
const GROUPS_REASON = "Grupos de convite: há uma regra sem valor.";

type N = Awaited<ReturnType<typeof renderNative>>;
async function mount(config: object = BASE) {
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
const failed = (n: N) => String(n.byTestId("settings-engine-save-failed").props.children ?? "");

beforeEach(() => {
  __resetReactNativeMock();
  api.getNotificationConfig.mockReset();
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...BASE, ...patch }));
});

describe("the iOS engine card's Save refuses a rule with no value (eligibility.rules rule 13)", () => {
  it("[ELIGIBILITY-RULES-19] a blank bar rule refuses the Save with its reason and sends nothing", async () => {
    expect(pt("settings.engine.blankRule.eligibility")).toBe(BAR_REASON);
    const n = await mount();
    await n.press("stub-bar-blank");
    await save(n);
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(failed(n)).toBe(`${TITLE} — ${BAR_REASON}`);

    // The screen's toast names the part with the reason, as web's.
    expect(SETTINGS_SCREEN).toMatch(/failed\.push\(failedPartText\(saver\.label, error\)\)/);

    await n.press("stub-bar-fill");
    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ eligibilityRules: FILLED_BAR });
  });

  it("[ELIGIBILITY-RULES-20] a blank group rule refuses the Save with its reason and sends nothing", async () => {
    expect(pt("settings.engine.blankRule.groups")).toBe(GROUPS_REASON);
    const n = await mount();
    await n.press("settings-tiers-header");
    await n.press("stub-tiers-blank");
    await n.press("settings-tiers-header"); // collapsed: the blank row is out of sight
    expect(n.queryByTestId("stub-tiers")).toBeNull();

    await save(n);
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(failed(n)).toBe(`${TITLE} — ${GROUPS_REASON}`);
    expect(n.queryByTestId("stub-tiers")).not.toBeNull();

    // With a blank bar rule too: one reason names both parts.
    await n.press("stub-bar-blank");
    await save(n);
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(failed(n)).toBe(`${TITLE} — ${BAR_REASON} ${GROUPS_REASON}`);

    await n.press("stub-bar-fill");
    await n.press("stub-tiers-fill");
    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ eligibilityRules: FILLED_BAR, invitationGroups: FILLED_GROUPS });
  });

  it("[ELIGIBILITY-RULES-20] a stored blank rule in a part the Save does not send never blocks it", async () => {
    const n = await mount({ ...BASE, eligibilityRules: BLANK_BAR, invitationGroups: BLANK_GROUPS });
    await n.toggle("open-spots-visible");
    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ openSpotsVisible: true });
    expect(failed(n)).toBe("");
  });
});
