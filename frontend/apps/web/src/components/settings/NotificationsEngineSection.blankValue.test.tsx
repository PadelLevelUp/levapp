/**
 * eligibility.rules rule 13 on the web engine card: the tab's Save refuses a bar or group rule that
 * needs a value and has none. It sends nothing from the card, keeps every edit held, opens the section
 * holding the first blank row and fails the card with a reason that names the part, in the owner's
 * words (read from the real pt locale). It reads only what the Save would send: a stored blank rule in
 * a part the coach did not touch never blocks.
 *
 * The bar and groups panels are stubs that set a blank or a filled rule, as in
 * NotificationsEngineSection.test.tsx; the panels' own marking is in their own tests.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NotificationConfig } from "@/types";

const { pt } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const PT = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../../src/locales/pt/settings.json"), "utf8"));
  const pt = (key: string): string => {
    const v = key.split(".").reduce<unknown>((n, p) => (n && typeof n === "object" ? (n as Record<string, unknown>)[p] : undefined), PT);
    return typeof v === "string" ? v : key;
  };
  return { pt };
});
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: pt, i18n: { language: "pt" } }) }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@/api/notificationEngine", () => api);

const { BLANK_BAR, FILLED_BAR, BLANK_GROUPS, FILLED_GROUPS, panel } = vi.hoisted(() => {
  const panel = (name: string, prop: string, blank: unknown, filled: unknown) =>
    function Panel(props: Record<string, unknown>) {
      const set = props.onChange as (v: unknown) => void;
      return (
        <div>
          <span data-testid={`stub-${name}-value`}>{JSON.stringify(props[prop])}</span>
          <button data-testid={`stub-${name}-blank`} onClick={() => set(blank)} />
          <button data-testid={`stub-${name}-fill`} onClick={() => set(filled)} />
        </div>
      );
    };
  return {
    BLANK_BAR: [{ attribute: "attendance_rate", operation: "greater_than" }],
    FILLED_BAR: [{ attribute: "attendance_rate", operation: "greater_than", value: 50 }],
    BLANK_GROUPS: [{ id: "g1", rules: [{ attribute: "justified_absences", operation: "less_than" }] }],
    FILLED_GROUPS: [{ id: "g1", rules: [{ attribute: "justified_absences", operation: "less_than", value: 2 }] }],
    panel,
  };
});
vi.mock("./EligibilitySection", () => ({ EligibilitySection: panel("eligibility", "rules", BLANK_BAR, FILLED_BAR) }));
vi.mock("./InvitationGroupsSection", () => ({
  DEFAULT_INVITATION_GROUPS: [{ id: "default", rules: [] }],
  InvitationGroupsSection: panel("groups", "groups", BLANK_GROUPS, FILLED_GROUPS),
}));
vi.mock("./RemindersSection", () => ({ RemindersSection: () => null }));
vi.mock("./EligibilityImpactNote", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./TiebreakersSection", () => ({ DEFAULT_TIEBREAKERS: [], TiebreakersSection: () => null }));
vi.mock("./RestrictionsPanel", () => ({ RestrictionsPanel: () => null }));
vi.mock("./NotificationGroupsSection", () => ({ NotificationGroupsSection: () => null }));
vi.mock("./MessageTemplatesSection", () => ({ MessageTemplatesSection: () => null }));
vi.mock("./StandingWaitingListSection", () => ({ StandingWaitingListSection: () => null }));

import { NotificationsEngineSection } from "./NotificationsEngineSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const CONFIG = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  invitationGroups: [{ id: "g0", rules: [{ attribute: "level", operation: "same_as_vacancy" }] }],
  eligibilityRules: null,
  tiebreakers: [],
  restrictions: {},
  notificationGroups: [],
  reminderTiming: {},
  messageTemplates: {},
} as unknown as NotificationConfig;

const ELIGIBILITY = pt("settings.engine.eligibility");
const GROUPS = pt("settings.engine.invitationGroups");
const BAR_REASON = "Elegibilidade: há uma regra sem valor.";
const GROUPS_REASON = "Grupos de convite: há uma regra sem valor.";

const save = () => fireEvent.click(screen.getByTestId("harness-save"));
const failed = () => screen.getByTestId("save-failed").textContent;
const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;
const settle = () => new Promise((r) => setTimeout(r, 50));
const toggleSection = (label: string) => fireEvent.click(screen.getByText(label));

beforeEach(() => {
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
});

async function mount() {
  render(
    <SettingsUnsavedTestHarness>
      <NotificationsEngineSection />
    </SettingsUnsavedTestHarness>,
  );
  await screen.findByTestId("notification-engine-auto-notify-toggle");
}

describe("the engine card's Save refuses a rule with no value (eligibility.rules rule 13)", () => {
  it("[ELIGIBILITY-RULES-19] a blank bar rule refuses the Save, sends nothing and opens the section", async () => {
    expect(pt("settings.engine.blankRule.eligibility")).toBe(BAR_REASON);
    await mount();
    toggleSection(ELIGIBILITY);
    fireEvent.click(await screen.findByTestId("stub-eligibility-blank"));
    fireEvent.click(screen.getByTestId("open-spots-visible"));
    toggleSection(ELIGIBILITY); // collapsed: the blank row is out of sight
    await waitFor(() => expect(screen.queryByTestId("stub-eligibility-value")).toBeNull());

    save();
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(failed()).toBe(`notificationEngine — ${BAR_REASON}`);
    expect(unsavedIds()).toBe("notificationEngine");
    // The section is open again on the blank row, and the edits are still held.
    expect(screen.getByTestId("stub-eligibility-value").textContent).toBe(JSON.stringify(BLANK_BAR));
    expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "checked");

    // Once filled, the same Save sends everything held.
    fireEvent.click(screen.getByTestId("stub-eligibility-fill"));
    save();
    await waitFor(() =>
      expect(api.updateNotificationConfig).toHaveBeenCalledWith({ openSpotsVisible: true, eligibilityRules: FILLED_BAR }),
    );
  });

  it("[ELIGIBILITY-RULES-20] a blank group rule refuses the Save, sends nothing and opens the section", async () => {
    expect(pt("settings.engine.blankRule.groups")).toBe(GROUPS_REASON);
    await mount();
    toggleSection(GROUPS);
    fireEvent.click(await screen.findByTestId("stub-groups-blank"));
    toggleSection(GROUPS);
    await waitFor(() => expect(screen.queryByTestId("stub-groups-value")).toBeNull());

    save();
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(failed()).toBe(`notificationEngine — ${GROUPS_REASON}`);
    expect(screen.getByTestId("stub-groups-value").textContent).toBe(JSON.stringify(BLANK_GROUPS));

    // With a blank bar rule as well: one reason names both parts, and the first section (the bar) opens.
    toggleSection(ELIGIBILITY);
    fireEvent.click(await screen.findByTestId("stub-eligibility-blank"));
    toggleSection(ELIGIBILITY);
    await waitFor(() => expect(screen.queryByTestId("stub-eligibility-value")).toBeNull());
    save();
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(failed()).toBe(`notificationEngine — ${BAR_REASON} ${GROUPS_REASON}`);
    expect(screen.getByTestId("stub-eligibility-value")).toBeInTheDocument();

    toggleSection(ELIGIBILITY);
    toggleSection(GROUPS);
    fireEvent.click(await screen.findByTestId("stub-groups-fill"));
    toggleSection(ELIGIBILITY);
    fireEvent.click(await screen.findByTestId("stub-eligibility-fill"));
    save();
    await waitFor(() =>
      expect(api.updateNotificationConfig).toHaveBeenCalledWith({ invitationGroups: FILLED_GROUPS, eligibilityRules: FILLED_BAR }),
    );
  });

  it("[ELIGIBILITY-RULES-20] a stored blank rule in a part the Save does not send never blocks it", async () => {
    api.getNotificationConfig.mockResolvedValue({ ...CONFIG, invitationGroups: BLANK_GROUPS, eligibilityRules: BLANK_BAR });
    await mount();
    fireEvent.click(screen.getByTestId("notification-engine-auto-notify-toggle"));
    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledWith({ autoNotifyEnabled: false }));
    await waitFor(() => expect(failed()).toBe(""));
  });
});
