/**
 * settings.explicit-save (PAD-506) on the web notification-engine card. Every control's change is
 * held in the card; the tab's one Save (here the harness's `harness-save`) sends what differs from
 * what the server confirmed, in one request, and the message templates as their own part. A failed
 * part stays on screen and unsaved, and is what a second Save sends again.
 *
 * The sub-panels are stubs that call onChange and show the value they were given, so this file
 * pins the card's wiring (what is held, what one Save sends), not each panel's own controls.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NotificationConfig } from "@/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@/api/notificationEngine", () => api);

function stub(name: string, prop: string, next: unknown) {
  return (props: Record<string, unknown>) => (
    <div>
      <span data-testid={`stub-${name}-value`}>{JSON.stringify(props[prop])}</span>
      <button data-testid={`stub-${name}-change`} onClick={() => (props.onChange as (v: unknown) => void)(next)} />
    </div>
  );
}
vi.mock("./RemindersSection", () => ({ RemindersSection: stub("reminders", "reminderTiming", { reminderCount: 3 }) }));
vi.mock("./InvitationGroupsSection", () => ({
  DEFAULT_INVITATION_GROUPS: [{ id: "default" }],
  InvitationGroupsSection: stub("groups", "groups", [{ id: "g2" }]),
}));
vi.mock("./EligibilitySection", () => ({ EligibilitySection: stub("eligibility", "rules", [{ attribute: "level" }]) }));
vi.mock("./EligibilityImpactNote", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./TiebreakersSection", () => ({ DEFAULT_TIEBREAKERS: [], TiebreakersSection: stub("tiebreakers", "tiebreakers", [{ id: "t" }]) }));
// Each click sends a new deadline (13, 14, …), so two held saves are told apart from the confirmed 24.
const restrictionClicks = vi.hoisted(() => ({ n: 0 }));
vi.mock("./RestrictionsPanel", () => ({
  RestrictionsPanel: (props: { restrictions: unknown; onChange: (v: unknown) => void }) => (
    <div>
      <span data-testid="stub-restrictions-value">{JSON.stringify(props.restrictions)}</span>
      <button
        data-testid="stub-restrictions-change"
        onClick={() => props.onChange({ cancellationDeadlineHours: 12 + ++restrictionClicks.n })}
      />
    </div>
  ),
}));
vi.mock("./NotificationGroupsSection", () => ({ NotificationGroupsSection: stub("notifyGroups", "groups", [{ id: "n" }]) }));
vi.mock("./MessageTemplatesSection", () => ({
  MessageTemplatesSection: (props: { templates: Record<string, string>; onChange: (v: unknown) => void }) => (
    <div>
      <span data-testid="stub-templates-value">{props.templates.reminder}</span>
      <button data-testid="stub-templates-change" onClick={() => props.onChange({ ...props.templates, reminder: "Olá {name}" })} />
      <button data-testid="stub-templates-revert" onClick={() => props.onChange({ ...props.templates, reminder: "" })} />
    </div>
  ),
}));
vi.mock("./StandingWaitingListSection", () => ({ StandingWaitingListSection: () => null }));

import { NotificationsEngineSection } from "./NotificationsEngineSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const CONFIG = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  invitationGroups: [{ id: "g1" }],
  eligibilityRules: null,
  tiebreakers: [],
  restrictions: {},
  notificationGroups: [],
  reminderTiming: {},
  messageTemplates: {},
} as unknown as NotificationConfig;

const toggle = () => screen.getByTestId("notification-engine-auto-notify-toggle");
const save = () => fireEvent.click(screen.getByTestId("harness-save"));
const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;
const failed = () => screen.getByTestId("save-failed").textContent;
const settle = () => new Promise((r) => setTimeout(r, 50));
async function openSection(labelKey: string) {
  fireEvent.click(screen.getByText(labelKey));
}

beforeEach(() => {
  restrictionClicks.n = 0;
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


describe("every engine control is held until the tab's Save (settings.explicit-save rules 2-3)", () => {
  it("the master toggle is held: nothing is sent until Save, which sends it once; then clean", async () => {
    await mount();
    fireEvent.click(toggle());
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(toggle()).toHaveAttribute("data-state", "unchecked");
    expect(unsavedIds()).toBe("notificationEngine");

    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledWith({ autoNotifyEnabled: false }));
    await waitFor(() => expect(unsavedIds()).toBe(""));
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
  });

  it("every sub-panel's change is held, and one Save sends them all in one request", async () => {
    await mount();
    for (const [label, key] of [
      ["settings.engine.reminders", "reminders"],
      ["settings.engine.eligibility", "eligibility"],
      ["settings.engine.invitationGroups", "groups"],
      ["settings.engine.tiebreakers", "tiebreakers"],
      ["settings.engine.restrictions", "restrictions"],
      ["settings.engine.notifyGroups", "notifyGroups"],
    ] as const) {
      await openSection(label);
      fireEvent.click(await screen.findByTestId(`stub-${key}-change`));
    }
    await openSection("settings.engine.eligibility");
    fireEvent.click(await screen.findByTestId("open-spots-visible"));
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();

    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({
      reminderTiming: { reminderCount: 3 },
      eligibilityRules: [{ attribute: "level" }],
      openSpotsVisible: true,
      invitationGroups: [{ id: "g2" }],
      tiebreakers: [{ id: "t" }],
      restrictions: { cancellationDeadlineHours: 13 },
      notificationGroups: [{ id: "n" }],
    });
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("changed and changed back is clean, and Save sends nothing", async () => {
    await mount();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    await waitFor(() => expect(unsavedIds()).toBe(""));
    save();
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
  });

  it("a failed Save keeps the held values on screen and unsaved; a second Save sends them again", async () => {
    await mount();
    await openSection("settings.engine.eligibility");
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByTestId("open-spots-visible"));
    fireEvent.click(screen.getByTestId("stub-eligibility-change"));

    save();
    await waitFor(() => expect(failed()).toBe("notificationEngine"));
    expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("stub-eligibility-value")).toHaveTextContent("level");
    expect(unsavedIds()).toBe("notificationEngine");

    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2));
    expect(api.updateNotificationConfig.mock.calls[1][0]).toEqual(api.updateNotificationConfig.mock.calls[0][0]);
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("after a Save only what changed since is sent", async () => {
    await mount();
    fireEvent.click(toggle());
    save();
    await waitFor(() => expect(unsavedIds()).toBe(""));
    await openSection("settings.engine.notifyGroups");
    fireEvent.click(await screen.findByTestId("stub-notifyGroups-change"));
    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2));
    expect(api.updateNotificationConfig.mock.calls[1][0]).toEqual({ notificationGroups: [{ id: "n" }] });
  });
});

describe("notifications.config rule 10c (PAD-478) on the Save's answer", () => {
  it("a timing the server stored but could not re-arm is saved AND says so; the next re-armed timing Save removes the note", async () => {
    await mount();
    await openSection("settings.engine.reminders");
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch, rescheduleFailed: true }));
    fireEvent.click(await screen.findByTestId("stub-reminders-change"));
    save();

    const note = await screen.findByTestId("notification-engine-reschedule-failed");
    expect(note).toHaveTextContent("settings.engine.rescheduleFailed");
    await waitFor(() => expect(unsavedIds()).toBe("")); // a saved value, not a failure
    expect(screen.getByTestId("stub-reminders-value")).toHaveTextContent('"reminderCount":3');
  });

  it("a Save that does not carry the timing leaves the note as it is", async () => {
    await mount();
    await openSection("settings.engine.reminders");
    api.updateNotificationConfig.mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch, rescheduleFailed: true }));
    fireEvent.click(await screen.findByTestId("stub-reminders-change"));
    save();
    await screen.findByTestId("notification-engine-reschedule-failed");

    fireEvent.click(toggle()); // its answer carries no rescheduleFailed
    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(unsavedIds()).toBe(""));
    expect(screen.getByTestId("notification-engine-reschedule-failed")).toBeTruthy();
  });
});

describe("the message templates are their own part of the Save", () => {
  it("a template edit is held and sent alone, as messageTemplates", async () => {
    await mount();
    fireEvent.click(screen.getByText("settings.engine.messageTemplates"));
    fireEvent.click(await screen.findByTestId("stub-templates-change"));
    await settle();
    expect(api.updateNotificationConfig).not.toHaveBeenCalled();
    expect(unsavedIds()).toBe("messageTemplates");

    save();
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1));
    expect(api.updateNotificationConfig.mock.calls[0][0]).toEqual({
      messageTemplates: expect.objectContaining({ reminder: "Olá {name}" }),
    });
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("a template typed back to what was stored is clean", async () => {
    await mount();
    fireEvent.click(screen.getByText("settings.engine.messageTemplates"));
    fireEvent.click(await screen.findByTestId("stub-templates-change"));
    await waitFor(() => expect(unsavedIds()).toBe("messageTemplates"));
    fireEvent.click(screen.getByTestId("stub-templates-revert"));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("a mixed result: the templates fail, the engine saves — only the templates stay unsaved", async () => {
    await mount();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByText("settings.engine.messageTemplates"));
    fireEvent.click(await screen.findByTestId("stub-templates-change"));
    api.updateNotificationConfig.mockImplementation(async (patch: Record<string, unknown>) => {
      if ("messageTemplates" in patch) throw new Error("offline");
      return { ...CONFIG, ...patch };
    });

    save();
    await waitFor(() => expect(failed()).toBe("messageTemplates"));
    expect(unsavedIds()).toBe("messageTemplates");
    expect(screen.getByTestId("stub-templates-value")).toHaveTextContent("Olá {name}");
    expect(toggle()).toHaveAttribute("data-state", "unchecked");
  });
});
