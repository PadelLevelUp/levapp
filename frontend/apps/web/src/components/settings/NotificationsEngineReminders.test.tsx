/**
 * PAD-478, review of #496: the REAL reminders form inside the REAL engine card, with only the API
 * mocked. The card's own tests stub RemindersSection and the form's own tests stub the card, so
 * nothing exercised the pair: the pause, the card's one save, the rollback, and what the stepper
 * shows afterwards (notifications.config rule 10d, settings.save-on-change rule 3).
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
  api.sendPastDueReminders.mockReset().mockResolvedValue({ sent: 3, scheduledFor: null, classes: [], skipped: 0 });
  toast.mockReset();
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
    // What the coach left it at, not the 1 the server still holds nor the 2 in flight.
    expect(shown()).toBe(4);

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

  it("closed with a value still inside the pause: it is saved through the card and shown on reopen", async () => {
    await mountOpen();

    plus(); // 2, inside the pause
    toggleReminders(); // close before the pause ends
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());

    expect(sentCounts()).toEqual([2]); // at once, not after 600 ms
    toggleReminders(); // the sign lives inside the section
    await screen.findByTestId("reminder-per-student");
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "saved"),
    );
    expect(shown()).toBe(2);
    await new Promise((r) => setTimeout(r, REMINDERS_SAVE_DELAY_MS + 100));
    expect(sentCounts()).toEqual([2]); // and never a second time
  });

  it("closed while a save is in flight that then fails: the value handed over is still sent and kept", async () => {
    await mountOpen();
    const slow = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);

    plus(); // 2
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG); // in flight, held
    plus(); // 3, inside the pause
    toggleReminders(); // close: 3 goes to the card, behind the save in flight
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    await act(async () => {
      slow.reject(new Error("offline"));
    });

    await waitFor(() => expect(sentCounts()).toEqual([2, 3]));
    toggleReminders();
    await screen.findByTestId("reminder-per-student");
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "saved"),
    );
    expect(shown()).toBe(3);
  });

  it("closed while a save is in flight, and both fail: back to the last value the server confirmed", async () => {
    await mountOpen();
    const slow = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));

    plus(); // 2
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG);
    plus(); // 3
    toggleReminders();
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    await act(async () => {
      slow.reject(new Error("offline"));
    });

    await waitFor(() => expect(sentCounts()).toEqual([2, 3]));
    toggleReminders();
    await screen.findByTestId("reminder-per-student");
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "failed"),
    );
    expect(shown()).toBe(1);
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
  it("a save that lists a class asks; yes sends exactly the listed keys and says what happened", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));

    plus();
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);
    expect(api.sendPastDueReminders).not.toHaveBeenCalled(); // the save itself sends nothing

    fireEvent.click(screen.getByTestId("past-due-send"));

    await waitFor(() => expect(dialog()).toBeNull());
    expect(api.sendPastDueReminders).toHaveBeenCalledTimes(1);
    expect(api.sendPastDueReminders).toHaveBeenCalledWith(["i:1"]);
    expect(toast).toHaveBeenCalledWith({ title: "settings.engine.pastDue.sentOne" });
  });

  it("a save that lists nothing does not ask", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([]));

    plus();
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "saved"), LONG);
    await settle();

    expect(dialog()).toBeNull();
  });

  it("'do not send' sends nothing, and the same class is not asked about again in this visit", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementation(answering([A]));

    plus();
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);
    fireEvent.click(screen.getByTestId("past-due-decline"));
    await waitFor(() => expect(dialog()).toBeNull());

    plus(); // a later timing save lists the same class
    await waitFor(() => expect(sentCounts()).toEqual([2, 3]), LONG);
    await waitFor(() =>
      expect(screen.getByTestId("notification-engine-reminders-sign")).toHaveAttribute("data-state", "saved"));
    await settle();

    expect(dialog()).toBeNull();
    expect(api.sendPastDueReminders).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("a class that was not asked about before is asked about, alone", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));
    plus();
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);
    fireEvent.click(screen.getByTestId("past-due-decline"));
    await waitFor(() => expect(dialog()).toBeNull());

    api.updateNotificationConfig.mockImplementationOnce(answering([A, B]));
    plus();
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);

    expect(screen.getByTestId("past-due-body")).toHaveTextContent("Kids");
    expect(screen.getByTestId("past-due-body")).not.toHaveTextContent("Academy B1");
    fireEvent.click(screen.getByTestId("past-due-send"));
    await waitFor(() => expect(api.sendPastDueReminders).toHaveBeenCalledWith(["o:7:2027-07-13"]));
  });

  it("is not asked while the coach is still editing: only the last save's answer asks, once", async () => {
    await mountOpen();
    const slow = deferred<object>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);
    api.updateNotificationConfig.mockImplementationOnce(answering([A, B]));

    plus(); // 2
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG); // in flight
    plus(); // 3: the coach is still editing when the first answer arrives
    await act(async () => {
      slow.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 }, pastDue: { reminders: [A], quietUntil: null } });
    });
    await settle();
    expect(dialog()).toBeNull();

    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);
    expect(sentCounts()).toEqual([2, 3]);
    expect(within(screen.getByTestId("past-due-list")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("an older save's answer never asks once a newer timing save has begun, even with the section closed", async () => {
    await mountOpen();
    const first = deferred<object>();
    const second = deferred<object>();
    api.updateNotificationConfig.mockImplementationOnce(() => first.promise);
    api.updateNotificationConfig.mockImplementationOnce(() => second.promise);

    plus(); // 2
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG); // in flight
    plus(); // 3
    await new Promise((r) => setTimeout(r, REMINDERS_SAVE_DELAY_MS + 100)); // 3 has begun; it waits at the card
    toggleReminders(); // close: the form holds nothing and is no longer editing
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    await act(async () => {
      first.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 }, pastDue: { reminders: [A], quietUntil: null } });
    });
    await waitFor(() => expect(sentCounts()).toEqual([2, 3]));
    await settle();
    expect(dialog()).toBeNull(); // the configuration that listed A is not the one being saved

    await act(async () => {
      second.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 3 }, pastDue: { reminders: [B], quietUntil: null } });
    });
    await waitFor(() => expect(dialog()).not.toBeNull());
    expect(screen.getByTestId("past-due-body")).toHaveTextContent("Kids");
    expect(screen.getByTestId("past-due-body")).not.toHaveTextContent("Academy B1");
  });

  it("an answer held back while the coach was editing is dropped when their next save begins", async () => {
    await mountOpen();
    const first = deferred<object>();
    const second = deferred<object>();
    api.updateNotificationConfig.mockImplementationOnce(() => first.promise);
    api.updateNotificationConfig.mockImplementationOnce(() => second.promise);

    plus(); // 2
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG); // in flight
    plus(); // 3, inside the pause: the coach is editing
    await act(async () => {
      first.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 }, pastDue: { reminders: [A], quietUntil: null } });
    });
    expect(dialog()).toBeNull(); // held back
    toggleReminders(); // close: 3 is handed to the card and its save begins
    await waitFor(() => expect(sentCounts()).toEqual([2, 3]));
    await settle();

    expect(dialog()).toBeNull(); // not asked about what the 2 listed while the 3 is being saved
    await act(async () => {
      second.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 3 }, pastDue: { reminders: [], quietUntil: null } });
    });
    await settle();
    expect(dialog()).toBeNull();
  });

  it("a failed send says so in the dialog, which stays open; trying again works", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));
    api.sendPastDueReminders.mockRejectedValueOnce(new Error("offline"));
    plus();
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);

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
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);

    fireEvent.click(screen.getByTestId("past-due-send"));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0].title).toContain("settings.engine.pastDue.scheduled");
  });

  it("when the server found nothing left to send, the coach is told that, not 'sent'", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(answering([A]));
    api.sendPastDueReminders.mockResolvedValueOnce({ sent: 0, scheduledFor: null, classes: [], skipped: 1 });
    plus();
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);

    fireEvent.click(screen.getByTestId("past-due-send"));

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "settings.engine.pastDue.nothingToSend" }));
  });

  it("a timing saved without the check says the check could not be made, and asks nothing", async () => {
    await mountOpen();
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch, pastDueUnknown: true }));

    plus();

    await waitFor(() => expect(screen.queryByTestId("notification-engine-past-due-unknown")).not.toBeNull(), LONG);
    expect(dialog()).toBeNull();

    plus(); // the next timing save makes the check: the note goes
    await waitFor(() => expect(screen.queryByTestId("notification-engine-past-due-unknown")).toBeNull(), LONG);
  });

  it("the 'check could not be made' note is visible with the reminders section closed", async () => {
    await mountOpen();
    const slow = deferred<object>();
    api.updateNotificationConfig.mockImplementationOnce(() => slow.promise);

    plus();
    await waitFor(() => expect(sentCounts()).toEqual([2]), LONG);
    toggleReminders(); // closed before the answer arrives
    await waitFor(() => expect(screen.queryByTestId("reminder-per-student")).toBeNull());
    await act(async () => {
      slow.resolve({ ...CONFIG, reminderTiming: { ...TIMING, reminderCount: 2 }, pastDueUnknown: true });
    });

    await waitFor(() => expect(screen.queryByTestId("notification-engine-past-due-unknown")).not.toBeNull());
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
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);

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
    await waitFor(() => expect(dialog()).not.toBeNull(), LONG);

    fireEvent.click(screen.getByTestId("past-due-send"));
    await screen.findByTestId("past-due-error");
    expect(toast).not.toHaveBeenCalled();

    // The server checks every class again, so sending the first 200 a second time sends nothing more.
    fireEvent.click(screen.getByTestId("past-due-send"));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(api.sendPastDueReminders.mock.calls.map(([keys]) => (keys as string[]).length)).toEqual([200, 50, 200, 50]);
  });
});
