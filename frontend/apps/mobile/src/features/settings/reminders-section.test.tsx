/**
 * PAD-776 part 3 (B-703; notifications.config rules 5, 10c, 10d, 10f): the iOS engine card carries
 * web's Reminders panel. Its four controls are there, the timing is held until the screen's Save
 * and goes in the same PATCH as web's (so the server's rule 11a re-timing runs from an iOS save as
 * from a web one), the two status notes show outside the closed panel, and the past-due question
 * is asked from the Save's answer with web's default: closing is "do not send".
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";
import { SectionSaveProbe } from "@/test/section-save-probe";
import { UnsavedRegistryProvider } from "./unsaved-registry";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

const toastApi = vi.hoisted(() => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: toastApi }));

const api = vi.hoisted(() => ({
  getNotificationConfig: vi.fn(),
  updateNotificationConfig: vi.fn(),
  sendPastDueReminders: vi.fn(),
  PAST_DUE_SEND_MAX: 2,
}));
vi.mock("@levelup/api", () => ({ notificationEngineApi: api }));

vi.mock("./eligibility-section", () => ({ EligibilitySection: () => null }));
vi.mock("./eligibility-impact-note", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./restrictions-section", () => ({ RestrictionsSection: () => null }));
vi.mock("@/components/ui/time-picker-input", async () => {
  const { Pressable } = await import("react-native");
  return {
    TimePickerInput: (p: { testID: string; onChange: (v: string) => void }) =>
      React.createElement(Pressable, { testID: p.testID, onPress: () => p.onChange("19:00") }),
  };
});
// The dialog primitives as plain views; closing (Cancel, or the overlay) is onOpenChange(false).
const dialog = vi.hoisted(() => ({ onOpenChange: null as null | ((open: boolean) => void) }));
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const box = (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children);
  return {
    AlertDialog: (p: { children?: React.ReactNode; onOpenChange: (open: boolean) => void }) => {
      dialog.onOpenChange = p.onOpenChange;
      return React.createElement(View, null, p.children);
    },
    AlertDialogContent: box,
    AlertDialogHeader: box,
    AlertDialogFooter: box,
    AlertDialogTitle: box,
    AlertDialogDescription: box,
    AlertDialogCancel: (p: { children?: React.ReactNode; testID?: string; disabled?: boolean }) =>
      React.createElement(Pressable, { testID: p.testID, disabled: p.disabled, onPress: () => dialog.onOpenChange?.(false) }, p.children),
  };
});

import { AutoInviteSection } from "./auto-invite-section";

const CONFIG = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  eligibilityRules: null,
  restrictions: {},
  reminderTiming: {
    firstReminder: { type: "hours_before", value: 48 },
    reminderCount: 1,
    hoursBetweenReminders: 4,
    invitationStart: { type: "days_before_at_time", days: 7, time: "19:30" },
  },
};

const PAST = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `i:${i + 1}`, title: `Aula ${i + 1}`, startsAt: "2027-07-12T18:00:00", students: 2 }));

type N = Awaited<ReturnType<typeof renderNative>>;
const text = (n: N, id: string) => String(n.byTestId(id).props.children);

beforeEach(() => {
  __resetReactNativeMock();
  toastApi.success.mockReset();
  dialog.onOpenChange = null;
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
  api.sendPastDueReminders.mockReset().mockImplementation(async (keys: string[]) => ({
    sent: keys.length, scheduledFor: null, skipped: 0, classes: keys.map((key) => ({ key, sent: 1, scheduledFor: null })),
  }));
});

async function mount(config: object = CONFIG) {
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
const openReminders = async (n: N) => {
  await n.press("settings-reminders-header");
  await n.flush();
};

describe("iOS Reminders panel (PAD-776 part 3)", () => {
  it("shows web's four controls once opened, with the saved values", async () => {
    const n = await mount();
    expect(n.queryByTestId("reminder-start-invitations")).toBeNull();
    await openReminders(n);
    for (const id of ["reminder-first-reminder-timing", "reminder-per-student", "reminder-start-invitations"]) {
      expect(n.queryByTestId(id)).not.toBeNull();
    }
    expect(text(n, "reminder-first-reminder-timing-hours-value")).toBe("48");
    expect(text(n, "reminder-start-invitations-days-value")).toBe("7");
    // Hours between reminders appears with a second reminder, as on web.
    expect(n.queryByTestId("reminder-hours-between")).toBeNull();
    await n.press("reminder-per-student-count-inc");
    expect(n.queryByTestId("reminder-hours-between")).not.toBeNull();
  });

  it("an invitation-start change is held, then saved in one PATCH as web sends it", async () => {
    const n = await mount();
    await openReminders(n);
    await n.press("reminder-start-invitations-days-dec");
    await n.press("reminder-start-invitations-days-dec");
    await n.press("reminder-start-invitations-days-dec");
    await n.press("reminder-start-invitations-days-dec");
    await n.press("reminder-start-invitations-days-dec");
    await n.press("reminder-start-invitations-time");
    await n.flush();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();

    await save(n);
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({
      reminderTiming: { ...CONFIG.reminderTiming, invitationStart: { type: "days_before_at_time", days: 2, time: "19:00" } },
    });
  });

  it("switching the mode starts from web's defaults; bounds hold", async () => {
    const n = await mount();
    await openReminders(n);
    await n.press("reminder-start-invitations-mode-hours");
    expect(text(n, "reminder-start-invitations-hours-value")).toBe("48");
    await n.press("reminder-first-reminder-timing-mode-days");
    expect(text(n, "reminder-first-reminder-timing-days-value")).toBe("2");
    expect(n.byTestId("reminder-per-student-count-dec").props.disabled).toBe(true);
  });

  it("is disabled while the engine is off, as on web", async () => {
    const n = await mount({ ...CONFIG, autoNotifyEnabled: false });
    await openReminders(n);
    expect(n.byTestId("reminder-start-invitations-days-inc").props.disabled).toBe(true);
  });

  it("the save's notes show outside the closed panel (rules 10c, 10f)", async () => {
    const n = await mount();
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({
      ...CONFIG, ...patch, rescheduleFailed: true, pastDueUnknown: true,
    }));
    await openReminders(n);
    await n.press("reminder-first-reminder-timing-hours-inc");
    await openReminders(n); // closed again before the answer
    await save(n);
    expect(n.queryByTestId("notification-engine-reschedule-failed")).not.toBeNull();
    expect(n.queryByTestId("notification-engine-past-due-unknown")).not.toBeNull();
    expect(n.queryByTestId("past-due-dialog")).toBeNull();
  });

  it("a Save that does not carry the timing never asks", async () => {
    const n = await mount();
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({
      ...CONFIG, ...patch, pastDue: { reminders: PAST(1), quietUntil: null },
    }));
    await n.toggle("open-spots-visible");
    await save(n);
    expect(n.queryByTestId("past-due-dialog")).toBeNull();
  });
});

describe("iOS past-due question (rule 10f)", () => {
  const askAbout = async (count: number, quietUntil: string | null = null) => {
    const n = await mount();
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({
      ...CONFIG, ...patch, pastDue: { reminders: PAST(count), quietUntil },
    }));
    await openReminders(n);
    await n.press("reminder-first-reminder-timing-hours-inc");
    await save(n);
    return n;
  };

  it("closing is 'do not send': nothing is sent and the class is not asked about again", async () => {
    const n = await askAbout(1);
    expect(n.queryByTestId("past-due-dialog")).not.toBeNull();
    await n.press("past-due-decline");
    await n.flush();
    expect(n.queryByTestId("past-due-dialog")).toBeNull();
    expect(api.sendPastDueReminders).not.toHaveBeenCalled();

    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({
      ...CONFIG, ...patch, pastDue: { reminders: PAST(1), quietUntil: null },
    }));
    await n.press("reminder-first-reminder-timing-hours-inc");
    await save(n);
    expect(n.queryByTestId("past-due-dialog")).toBeNull();
  });

  it("a yes sends every class, in parts of PAST_DUE_SEND_MAX, and says what happened", async () => {
    const n = await askAbout(3);
    expect(n.queryByTestId("past-due-list")).not.toBeNull();
    await n.press("past-due-send");
    await n.flush();
    expect(api.sendPastDueReminders.mock.calls).toEqual([[["i:1", "i:2"]], [["i:3"]]]);
    expect(n.queryByTestId("past-due-dialog")).toBeNull();
    expect(toastApi.success).toHaveBeenCalledWith("settings.engine.pastDue.sentMany");
  });

  it("a failed send keeps the dialog open with the error; trying again sends", async () => {
    const n = await askAbout(1);
    api.sendPastDueReminders.mockRejectedValueOnce(new Error("offline"));
    await n.press("past-due-send");
    await n.flush();
    expect(n.queryByTestId("past-due-dialog")).not.toBeNull();
    expect(n.queryByTestId("past-due-error")).not.toBeNull();

    await n.press("past-due-send");
    await n.flush();
    expect(api.sendPastDueReminders).toHaveBeenCalledTimes(2);
    expect(n.queryByTestId("past-due-dialog")).toBeNull();
  });
});
