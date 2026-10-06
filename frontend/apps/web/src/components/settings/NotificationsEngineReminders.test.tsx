/**
 * PAD-478, review of #496: the REAL reminders form inside the REAL engine card, with only the API
 * mocked. Since PAD-506 (settings.explicit-save) a timing change is held and sent by the tab's one
 * Save — here the test harness's `harness-save` — and the Save's answer drives the past-due question
 * (notifications.config rule 10f) and the "could not re-arm" note (rule 10c).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NotificationConfig } from "@/types";

// `t` shows its variables, so a test can see WHICH class the dialog names.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    i18n: { language: "en" },
  }),
}));

const api = vi.hoisted(() => ({
  getNotificationConfig: vi.fn(),
  updateNotificationConfig: vi.fn(),
  sendPastDueReminders: vi.fn(),
  PAST_DUE_SEND_MAX: 200,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
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
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

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

const perStudent = () => within(screen.getByTestId("reminder-per-student"));
const shown = () => Number(perStudent().getByText(/^\d+$/).textContent);
const minus = () => fireEvent.click(perStudent().getAllByRole("button")[0]);
const plus = () => fireEvent.click(perStudent().getAllByRole("button")[1]);
const toggleReminders = () => fireEvent.click(screen.getByText("settings.engine.reminders"));
const save = () => fireEvent.click(screen.getByTestId("harness-save"));
const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;
const sentCounts = () =>
  api.updateNotificationConfig.mock.calls.map(
    ([patch]) => (patch as { reminderTiming: { reminderCount: number } }).reminderTiming.reminderCount,
  );

beforeEach(() => {
  localStorage.setItem("accessToken", "t");
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
  api.sendPastDueReminders.mockReset().mockResolvedValue({ sent: 3, scheduledFor: null, classes: [], skipped: 0 });
  toast.mockReset();
});

async function mountOpen() {
  render(
    <SettingsUnsavedTestHarness>
      <NotificationsEngineSection />
    </SettingsUnsavedTestHarness>,
  );
  await screen.findByTestId("notification-engine-auto-notify-toggle");
  toggleReminders();
  await screen.findByTestId("reminder-per-student");
}

describe("the reminders form inside the engine card (settings.explicit-save, PAD-506)", () => {
  it("a timing change is held: nothing is sent until Save, which sends it once and leaves the card clean", async () => {
    await mountOpen();
    plus();
    expect(shown()).toBe(2);
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(unsavedIds()).toBe("notificationEngine");

    save();
    await waitFor(() => expect(sentCounts()).toEqual([2]));
    await waitFor(() => expect(unsavedIds()).toBe(""));
    expect(shown()).toBe(2);
  });

  it("changed and changed back is clean, and Save sends nothing", async () => {
    await mountOpen();
    plus();
    minus();
    await waitFor(() => expect(unsavedIds()).toBe(""));
    save();
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
  });

  it("a failed Save keeps the coach's value on screen and unsaved; a second Save sends it again", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));
    plus();
    save();
    await waitFor(() => expect(screen.getByTestId("save-failed")).toHaveTextContent("notificationEngine"));
    expect(shown()).toBe(2);
    expect(unsavedIds()).toBe("notificationEngine");

    save();
    await waitFor(() => expect(sentCounts()).toEqual([2, 2]));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("closed with a held value: the value is kept and shown on reopen, and Save sends it", async () => {
    await mountOpen();
    plus();
    toggleReminders();
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    toggleReminders();
    await screen.findByTestId("reminder-per-student");
    expect(shown()).toBe(2);
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();

    save();
    await waitFor(() => expect(sentCounts()).toEqual([2]));
  });
});

// notifications.config rule 10f: a timing save answers with the classes whose reminder time is
// already past. The save sent nothing; the form asks the coach once, after they stop editing.
const A = { key: "i:1", title: "Academy B1", startsAt: "2027-07-12T18:00:00", students: 3 };
const B = { key: "o:7:2027-07-13", title: "Kids", startsAt: "2027-07-13T10:00:00", students: 2 };
const answering = (reminders: object[], extra: object = {}) =>
  async (patch: object) => ({ ...CONFIG, ...patch, pastDue: { reminders, quietUntil: null }, ...extra });
const dialog = () => screen.queryByTestId("past-due-dialog");
const settle = () => new Promise((r) => setTimeout(r, 50));

describe("the coach is asked before anything past due is sent (PAD-478, rule 10f)", () => {
  it("a Save that lists a class asks; yes sends exactly the listed keys and says what happened", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));

    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(api.sendPastDueReminders).not.toHaveBeenCalled(); // the save itself sends nothing

    fireEvent.click(screen.getByTestId("past-due-send"));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(api.sendPastDueReminders).toHaveBeenCalledTimes(1);
    expect(api.sendPastDueReminders).toHaveBeenCalledWith(["i:1"]);
    expect(toast).toHaveBeenCalledWith({ title: "settings.engine.pastDue.sentOne" });
  });

  it("nothing is asked before Save, however the timing is edited", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementation(answering([A]));
    plus();
    plus();
    await settle();
    expect(dialog()).toBeNull();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
  });

  it("a Save that lists nothing does not ask", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([]));

    plus();
    save();
    await waitFor(() => expect(unsavedIds()).toBe(""));
    await settle();

    expect(dialog()).toBeNull();
  });

  it("a Save that does not change the timing never asks", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementation(answering([A]));
    fireEvent.click(screen.getByTestId("notification-engine-auto-notify-toggle"));
    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledWith({ autoNotifyEnabled: false }));
    await settle();
    expect(dialog()).toBeNull();
  });

  it("'do not send' sends nothing, and the same class is not asked about again in this visit", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementation(answering([A]));

    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());
    fireEvent.click(screen.getByTestId("past-due-decline"));
    await waitFor(() => expect(dialog()).toBeNull());

    plus(); // a later timing save lists the same class
    save();
    await waitFor(() => expect(sentCounts()).toEqual([2, 3]));
    await waitFor(() => expect(unsavedIds()).toBe(""));
    await settle();

    expect(dialog()).toBeNull();
    expect(api.sendPastDueReminders).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("a class that was not asked about before is asked about, alone", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());
    fireEvent.click(screen.getByTestId("past-due-decline"));
    await waitFor(() => expect(dialog()).toBeNull());

    api.updateNotificationConfig.mockImplementationOnce(answering([A, B]));
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());

    expect(screen.getByTestId("past-due-body")).toHaveTextContent("Kids");
    expect(screen.getByTestId("past-due-body")).not.toHaveTextContent("Academy B1");
    fireEvent.click(screen.getByTestId("past-due-send"));
    await waitFor(() => expect(api.sendPastDueReminders).toHaveBeenCalledWith(["o:7:2027-07-13"]));
  });

  it("a failed send says so in the dialog, which stays open; trying again works", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));
    api.sendPastDueReminders.mockRejectedValueOnce(new Error("offline"));
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());

    fireEvent.click(screen.getByTestId("past-due-send"));
    await screen.findByTestId("past-due-error");
    expect(dialog()).not.toBeNull();
    expect(toast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("past-due-send"));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(api.sendPastDueReminders).toHaveBeenCalledTimes(2);
  });

  it("inside quiet hours a yes is scheduled, and the coach is told the time", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(
      async (patch: object) => ({ ...CONFIG, ...patch, pastDue: { reminders: [A], quietUntil: "2027-07-12T06:00:00Z" } }),
    );
    api.sendPastDueReminders.mockResolvedValueOnce({ sent: 0, scheduledFor: "2027-07-12T06:00:00Z", classes: [], skipped: 0 });
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());

    fireEvent.click(screen.getByTestId("past-due-send"));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0].title).toContain("settings.engine.pastDue.scheduled");
  });

  it("when the server found nothing left to send, the coach is told that, not 'sent'", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));
    api.sendPastDueReminders.mockResolvedValueOnce({ sent: 0, scheduledFor: null, classes: [], skipped: 1 });
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());

    fireEvent.click(screen.getByTestId("past-due-send"));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "settings.engine.pastDue.nothingToSend" }));
  });

  it("a timing saved without the check says the check could not be made, and asks nothing", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch, pastDueUnknown: true }));

    plus();
    save();

    await waitFor(() => expect(screen.queryByTestId("notification-engine-past-due-unknown")).not.toBeNull());
    expect(dialog()).toBeNull();

    plus(); // the next timing save makes the check: the note goes
    save();
    await waitFor(() => expect(screen.queryByTestId("notification-engine-past-due-unknown")).toBeNull());
  });

  it("the 'check could not be made' note is visible with the reminders section closed", async () => {
    await mountOpen();
    const slow = deferred<object>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);

    plus();
    toggleReminders(); // closed before the Save
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    save();
    await waitFor(() => expect(sentCounts()).toEqual([2]));
    await act(async () => {
      slow.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 }, pastDueUnknown: true });
    });

    await waitFor(() => expect(screen.queryByTestId("notification-engine-past-due-unknown")).not.toBeNull());
    expect(screen.queryByTestId("reminder-per-student")).toBeNull();
  });

  it("the 'reminders could not be re-armed' note (rule 10c) is visible with the reminders section closed", async () => {
    await mountOpen();
    const slow = deferred<object>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);

    plus();
    toggleReminders(); // closed before the Save
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    save();
    await waitFor(() => expect(sentCounts()).toEqual([2]));
    await act(async () => {
      slow.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 }, rescheduleFailed: true });
    });

    await waitFor(() => expect(screen.queryByTestId("notification-engine-reschedule-failed")).not.toBeNull());
    expect(screen.queryByTestId("reminder-per-student")).toBeNull();
  });

  it("more classes than one request may carry are sent in several requests, every key once", async () => {
    await mountOpen();
    const many = Array.from({ length: 450 }, (_, n) => ({ ...A, key: `i:${n + 1}` }));
    api.updateNotificationConfig.mockImplementationOnce(answering(many));
    api.sendPastDueReminders.mockReset().mockImplementation(async (keys: string[]) => ({
      sent: keys.length,
      scheduledFor: null,
      classes: keys.map((key) => ({ key, sent: 1, scheduledFor: null })),
      skipped: 0,
    }));
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());

    fireEvent.click(screen.getByTestId("past-due-send"));
    await waitFor(() => expect(dialog()).toBeNull());

    const batches = api.sendPastDueReminders.mock.calls.map(([keys]) => keys as string[]);
    expect(batches.map((b) => b.length)).toEqual([200, 200, 50]);
    expect(new Set(batches.flat()).size).toBe(450);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({ title: 'settings.engine.pastDue.sentMany {"count":450}' });
  });

  it("a request that fails part-way keeps the dialog open; trying again sends every key again", async () => {
    await mountOpen();
    const many = Array.from({ length: 250 }, (_, n) => ({ ...A, key: `i:${n + 1}` }));
    api.updateNotificationConfig.mockImplementationOnce(answering(many));
    api.sendPastDueReminders
      .mockReset()
      .mockResolvedValueOnce({ sent: 200, scheduledFor: null, classes: [], skipped: 0 })
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ sent: 0, scheduledFor: null, classes: [], skipped: 200 });
    plus();
    save();
    await waitFor(() => expect(dialog()).not.toBeNull());

    fireEvent.click(screen.getByTestId("past-due-send"));
    await screen.findByTestId("past-due-error");
    expect(toast).not.toHaveBeenCalled();

    // The server checks every class again, so sending the first 200 a second time sends nothing more.
    fireEvent.click(screen.getByTestId("past-due-send"));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(api.sendPastDueReminders.mock.calls.map(([keys]) => (keys as string[]).length)).toEqual([200, 50, 200, 50]);
  });
});
