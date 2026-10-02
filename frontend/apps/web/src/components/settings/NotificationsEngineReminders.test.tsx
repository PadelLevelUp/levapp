/**
 * PAD-478, review of #496: the REAL reminders form inside the REAL engine card, with only the API
 * mocked. The card's own tests stub RemindersSection and the form's own tests stub the card, so
 * nothing exercised the pair: the pause, the card's one save, the rollback, and what the stepper
 * shows afterwards (notifications.config rule 10d, settings.save-on-change rule 3).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NotificationConfig } from "@/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@/api/notificationEngine", () => api);

// Every other sub-panel is out of the picture; RemindersSection is NOT mocked.
vi.mock("./InvitationGroupsSection", () => ({ DEFAULT_INVITATION_GROUPS: [], InvitationGroupsSection: () => null }));
vi.mock("./EligibilitySection", () => ({ EligibilitySection: () => null }));
vi.mock("./EligibilityImpactNote", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./TiebreakersSection", () => ({ DEFAULT_TIEBREAKERS: [], TiebreakersSection: () => null }));
vi.mock("./RestrictionsPanel", () => ({ RestrictionsPanel: () => null }));
vi.mock("./NotificationGroupsSection", () => ({ NotificationGroupsSection: () => null }));
vi.mock("./MessageTemplatesSection", () => ({ MessageTemplatesSection: () => null }));
vi.mock("./StandingWaitingListSection", () => ({ StandingWaitingListSection: () => null }));

import { NotificationsEngineSection } from "./NotificationsEngineSection";
import { REMINDERS_SAVE_DELAY_MS } from "./RemindersSection";

const TIMING = {
  firstReminder: { type: "hours_before", value: 48 },
  reminderCount: 1,
  hoursBetweenReminders: 4,
  invitationStart: { type: "hours_before", value: 24 },
};
const CONFIG = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  invitationGroups: [],
  eligibilityRules: null,
  tiebreakers: [],
  restrictions: {},
  notificationGroups: [],
  reminderTiming: TIMING,
  messageTemplates: {},
} as unknown as NotificationConfig;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const LONG = { timeout: REMINDERS_SAVE_DELAY_MS + 2000 };
const perStudent = () => within(screen.getByTestId("reminder-per-student"));
const shown = () => Number(perStudent().getByText(/^\d+$/).textContent);
const minus = () => fireEvent.click(perStudent().getAllByRole("button")[0]);
const plus = () => fireEvent.click(perStudent().getAllByRole("button")[1]);
const toggleReminders = () => fireEvent.click(screen.getByText("settings.engine.reminders"));
const sentCounts = () =>
  api.updateNotificationConfig.mock.calls.map(
    ([patch]) => (patch as { reminderTiming: { reminderCount: number } }).reminderTiming.reminderCount,
  );

beforeEach(() => {
  localStorage.setItem("accessToken", "t");
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
});

async function mountOpen() {
  render(<NotificationsEngineSection />);
  await screen.findByTestId("notification-engine-auto-notify-toggle");
  toggleReminders();
  await screen.findByTestId("reminder-per-student");
}

describe("the reminders form inside the engine card (PAD-478)", () => {
  it("a confirmed save keeps the value the coach chose", async () => {
    await mountOpen();
    plus();
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG);
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "saved"),
    );
    expect(shown()).toBe(2);
  });

  it("a failed save with nothing waiting returns the stepper to the server's value", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));

    plus();
    expect(shown()).toBe(2);
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG);
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "failed"),
    );

    await waitFor(() => expect(shown()).toBe(1));
  });

  it("closed and reopened during a slow save: the coach's last choice is what the server and the screen end on", async () => {
    await mountOpen();
    const slow = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);

    plus(); // 2
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG); // in flight, held
    plus();
    plus(); // 4
    await new Promise((r) => setTimeout(r, REMINDERS_SAVE_DELAY_MS + 100)); // 4 waits behind the save in flight
    toggleReminders(); // close
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    toggleReminders(); // reopen
    await screen.findByTestId("reminder-per-student");

    minus(); // the coach's LAST choice
    const lastChoice = shown();
    await new Promise((r) => setTimeout(r, REMINDERS_SAVE_DELAY_MS + 100));

    await act(async () => {
      slow.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 } } as unknown as NotificationConfig);
    });
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "saved"),
    );
    await new Promise((r) => setTimeout(r, 50)); // anything still queued has gone out by now

    expect(sentCounts().at(-1)).toBe(lastChoice);
    expect(shown()).toBe(lastChoice);
  });
});
