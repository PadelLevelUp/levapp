/**
 * notifications.config rule 20 (PAD-920) on web: the new engine's own settings — M, the timing
 * method, the pair of timers from ENGINE_T_FLOOR, the two toggles and the tiers editor — appear for
 * a coach whose `engineVersion` is "new" only, and are held until the tab's Save like every other
 * engine control (settings.explicit-save), which sends them as `engine`. A coach on "old" sees
 * today's screen, `maxInactiveTime`'s 15-minute floor included.
 *
 * The groups editor and the restrictions panel are the real ones (the tiers editor and the 15
 * floor are what is asserted); the other sub-panels are inert. Copy is asserted by key (the
 * mock returns keys) and the "Lado contrário" words are pinned in the pt locale file.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NotificationConfig } from "@/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn(), searchPlayers: vi.fn() }));
vi.mock("@/api/notificationEngine", () => api);
vi.mock("@levelup/hooks", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCoachDisplayName: () => (_id: unknown, fallback: string | null | undefined) => fallback ?? "",
}));

vi.mock("./RemindersSection", () => ({ RemindersSection: () => null }));
vi.mock("./EligibilitySection", () => ({ EligibilitySection: () => null }));
vi.mock("./EligibilityImpactNote", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./TiebreakersSection", () => ({ DEFAULT_TIEBREAKERS: [], TiebreakersSection: () => null }));
vi.mock("./NotificationGroupsSection", () => ({ NotificationGroupsSection: () => null }));
vi.mock("./MessageTemplatesSection", () => ({ MessageTemplatesSection: () => null }));
vi.mock("./StandingWaitingListSection", () => ({ StandingWaitingListSection: () => null }));

import { NotificationsEngineSection } from "./NotificationsEngineSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const RESTRICTIONS = {
  maxSimultaneous: { enabled: true, value: 3 },
  maxTotal: { enabled: false, value: 10 },
  maxInactiveTime: { enabled: true, value: 15 },
  minTimeBeforeClass: { enabled: false, value: 30 },
  maxInvitesPerStudentPerDay: { enabled: false, value: 2 },
  quietHours: { enabled: false },
  excludedPlayers: { enabled: false, playerIds: [] },
  excludeUnpaidSubscription: { enabled: false },
  noSameDayClass: { enabled: true },
  cancellationDeadlineHours: 24,
};

const GROUPS = [
  { id: "g1", rules: [{ attribute: "side", operation: "same_as_vacancy" }] },
  { id: "g2", rules: [] },
];

const BASE = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  invitationGroups: GROUPS,
  eligibilityRules: null,
  tiebreakers: [],
  restrictions: RESTRICTIONS,
  notificationGroups: [],
  reminderTiming: {},
  messageTemplates: {},
};

// Between rounds starts at 2 (one step from the floor); between groups is null and shows maxInactiveTime's 15.
const NEW_CONFIG = {
  ...BASE,
  engineVersion: "new",
  engine: {
    maxAtATime: null,
    timing: { method: "fixed", betweenRoundsMinutes: 2, betweenGroupsMinutes: null },
    autoEntryBeforeAttendanceRequest: false,
    waitingListSideChoice: false,
  },
} as unknown as NotificationConfig;

const OLD_CONFIG = { ...BASE, engineVersion: "old" } as unknown as NotificationConfig;

const OTHER_SIDE = "settings.invitationGroups.operations.otherSide";
const value = (id: string) => screen.getByTestId(id).textContent;
const click = (id: string) => fireEvent.click(screen.getByTestId(id));
const settle = () => new Promise((r) => setTimeout(r, 50));

/** Radix Select in jsdom: Enter opens it; the options are then in the document. */
function openSelect(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: "Enter" });
}

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  api.getNotificationConfig.mockReset();
  api.searchPlayers.mockReset().mockResolvedValue([]);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...NEW_CONFIG, ...patch }));
});

async function mount(cfg: NotificationConfig) {
  api.getNotificationConfig.mockResolvedValue(cfg);
  const view = render(
    <SettingsUnsavedTestHarness>
      <NotificationsEngineSection />
    </SettingsUnsavedTestHarness>,
  );
  await screen.findByTestId("notification-engine-auto-notify-toggle");
  return view;
}

describe("notifications.config rule 20: the new engine's settings on web (PAD-920)", () => {
  it("[NOTIFICATIONS-CONFIG-71] shows the new engine's controls to a coach on new only", async () => {
    // ── A coach on "new" ──
    const view = await mount(NEW_CONFIG);

    // M: null shows the engine's default and becomes explicit on the first step.
    expect(value("engine-max-at-a-time-value")).toBe("12");
    click("engine-max-at-a-time-inc");
    expect(value("engine-max-at-a-time-value")).toBe("13");

    // The method: three choices, "fixed" held.
    for (const m of ["fixed", "per_tier", "progressive"]) expect(screen.getByTestId(`engine-timing-method-${m}`)).toBeTruthy();
    expect(screen.getByTestId("engine-timing-method-fixed")).toHaveAttribute("data-state", "checked");

    // The pair steps from ENGINE_T_FLOOR (1 minute), below maxInactiveTime's 15.
    expect(value("engine-between-rounds-value")).toBe("2");
    click("engine-between-rounds-dec");
    expect(value("engine-between-rounds-value")).toBe("1");
    expect(screen.getByTestId("engine-between-rounds-dec")).toBeDisabled();
    expect(value("engine-between-groups-value")).toBe("15");
    click("engine-between-groups-dec");
    expect(value("engine-between-groups-value")).toBe("14");

    // The two toggles.
    expect(screen.getByTestId("engine-auto-entry")).toHaveAttribute("data-state", "unchecked");
    click("engine-auto-entry");
    click("engine-side-choice");
    expect(screen.getByTestId("engine-side-choice")).toHaveAttribute("data-state", "checked");

    click("engine-timing-method-per_tier");

    // The tiers editor: the two lists first, fixed, then the groups from tier 2.
    fireEvent.click(screen.getByText("settings.engine.invitationGroups"));
    const editor = await screen.findByTestId("tiers-editor");
    for (const [tier, labelKey] of [
      [0, "calendar.detail.tierCoachList"],
      [1, "calendar.detail.tierWaitingList"],
    ] as const) {
      const row = within(editor).getByTestId(`tier-row-${tier}`);
      expect(row).toHaveTextContent(labelKey);
      expect(row).toHaveTextContent("settings.engine.newEngine.tiers.fixed");
      expect(within(row).queryByRole("combobox")).toBeNull();
      expect(screen.queryByTestId(`tier-remove-${tier}`)).toBeNull();
    }
    expect(within(editor).getByTestId("tier-row-2")).toBeTruthy();
    expect(within(editor).getByTestId("tier-row-3")).toBeTruthy();
    expect(screen.getByTestId("tier-add")).toBeTruthy();
    expect(screen.getByTestId("tier-remove-2")).toBeTruthy();

    // Per tier: a null entry shows the card's pair and becomes explicit on the first step.
    expect(value("tier-0-between-rounds-value")).toBe("1");
    expect(value("tier-2-between-groups-value")).toBe("14");
    click("tier-2-between-groups-inc");
    expect(value("tier-2-between-groups-value")).toBe("15");

    // The side rule offers "Lado contrário" to a coach on new.
    openSelect(screen.getByTestId("tier-side-2"));
    expect(await screen.findByRole("option", { name: "settings.invitationGroups.operations.balanceSides" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: OTHER_SIDE }));
    await waitFor(() => expect(screen.getByTestId("tier-side-2")).toHaveTextContent(OTHER_SIDE));

    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({
      invitationGroups: [{ id: "g1", rules: [{ attribute: "side", operation: "different_from_vacancy" }] }, { id: "g2", rules: [] }],
      engine: {
        maxAtATime: 13,
        timing: {
          method: "per_tier",
          betweenRoundsMinutes: 1,
          betweenGroupsMinutes: 14,
          perTier: [null, null, { betweenRoundsMinutes: null, betweenGroupsMinutes: 15 }, null],
        },
        autoEntryBeforeAttendanceRequest: true,
        waitingListSideChoice: true,
      },
    });
    for (const [lang, words] of [["pt", "Lado contrário"], ["en", "Other side"]]) {
      const settings = JSON.parse(readFileSync(resolve(__dirname, `../../../../../src/locales/${lang}/settings.json`), "utf8"));
      expect(settings.settings.invitationGroups.operations.otherSide).toBe(words);
    }
    view.unmount();

    // ── A coach on "old": today's screen ──
    await mount(OLD_CONFIG);
    expect(screen.queryAllByTestId(/^engine-/)).toHaveLength(0);
    fireEvent.click(screen.getByText("settings.engine.invitationGroups"));
    const group = await screen.findByTestId("invitation-group-0");
    expect(screen.queryByTestId("tiers-editor")).toBeNull();
    expect(screen.queryAllByTestId(/^tier-/)).toHaveLength(0);
    openSelect(within(group).getAllByRole("combobox")[1]);
    expect(await screen.findByRole("option", { name: "settings.invitationGroups.operations.balanceSides" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: OTHER_SIDE })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    // maxInactiveTime still starts at 15.
    fireEvent.click(screen.getByText("settings.engine.restrictions"));
    const row = await screen.findByTestId("restriction-row-max-inactive-time");
    expect(row).toHaveTextContent("15");
    expect(within(row).getAllByRole("button")[0]).toBeDisabled();
  });

  it("perTier follows the groups (remove, add) and is sent only with per_tier", async () => {
    await mount({
      ...NEW_CONFIG,
      engine: {
        ...NEW_CONFIG.engine!,
        timing: {
          method: "per_tier",
          betweenRoundsMinutes: 5,
          betweenGroupsMinutes: 30,
          perTier: [null, null, { betweenRoundsMinutes: 3, betweenGroupsMinutes: 20 }, null],
        },
      },
    } as NotificationConfig);
    fireEvent.click(screen.getByText("settings.engine.invitationGroups"));
    await screen.findByTestId("tiers-editor");

    click("tier-remove-2");
    expect(value("tier-2-between-rounds-value")).toBe("5"); // g2, now tier 2, keeps its null entry
    click("tier-add");
    expect(screen.getByTestId("tier-row-3")).toBeTruthy();
    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1));
    const first = api.updateNotificationConfig.mock.calls[0][0];
    expect(first.invitationGroups.map((g: { id: string }) => g.id)[0]).toBe("g2");
    expect(first.invitationGroups).toHaveLength(2);
    expect(first.engine.timing.perTier).toEqual([null, null, null, null]);

    click("engine-timing-method-fixed");
    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2));
    expect(api.updateNotificationConfig.mock.calls[1][0]).toEqual({
      engine: expect.objectContaining({ timing: { method: "fixed", betweenRoundsMinutes: 5, betweenGroupsMinutes: 30 } }),
    });
    expect(screen.queryByTestId("tier-2-between-rounds-value")).toBeNull();
  });
});
