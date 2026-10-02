/**
 * settings.save-on-change rules 1-3 + B-243 (PAD-473) on the web notification-engine card. Every
 * control behind the card's one save() signs its save and, on a failure, says so and returns to the
 * last value the server confirmed — only the fields whose newest save failed. The reminders
 * subsection is the named exception (PAD-478): no sign, saved exactly as before.
 *
 * The sub-panels are stubs that call onChange and show the value they were given, so this file
 * pins the card's wiring (keys, signs, rollback), not each panel's own controls.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./MessageTemplatesSection", () => ({ MessageTemplatesSection: () => null }));
vi.mock("./StandingWaitingListSection", () => ({ StandingWaitingListSection: () => null }));

import { NotificationsEngineSection } from "./NotificationsEngineSection";

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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const toggle = () => screen.getByTestId("notification-engine-auto-notify-toggle");
const sign = (key: string) => screen.getByTestId(`notification-engine-${key}-sign`);
async function openSection(labelKey: string) {
  fireEvent.click(screen.getByText(labelKey));
}

beforeEach(() => {
  restrictionClicks.n = 0;
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
});

async function mount() {
  render(<NotificationsEngineSection />);
  await screen.findByTestId("notification-engine-auto-notify-toggle");
}

describe("the engine card signs its saves (settings.save-on-change rule 2)", () => {
  it("the master toggle saves and signs", async () => {
    await mount();
    fireEvent.click(toggle());

    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ autoNotifyEnabled: false });
    await waitFor(() => expect(sign("auto-notify")).toHaveAttribute("data-state", "saved"));
  });

  it("each sub-panel signs under its own key", async () => {
    await mount();
    for (const [label, key] of [
      ["settings.engine.eligibility", "eligibility"],
      ["settings.engine.invitationGroups", "groups"],
      ["settings.engine.tiebreakers", "tiebreakers"],
      ["settings.engine.restrictions", "restrictions"],
      ["settings.engine.notifyGroups", "notifyGroups"],
    ] as const) {
      await openSection(label);
      fireEvent.click(await screen.findByTestId(`stub-${key}-change`));
      await waitFor(() => expect(sign(key)).toHaveAttribute("data-state", "saved"));
    }
  });

  it("PAD-478: the reminders sub-panel sends the same request as before and has no sign", async () => {
    await mount();
    await openSection("settings.engine.reminders");
    fireEvent.click(await screen.findByTestId("stub-reminders-change"));

    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ reminderTiming: { reminderCount: 3 } });
    expect(screen.queryByTestId("notification-engine-reminders-sign")).toBeNull();
  });
});

describe("a failed save is never silent (rule 3, B-243)", () => {
  it("open spots: says so and shows the confirmed value", async () => {
    await mount();
    await openSection("settings.engine.eligibility");
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));

    fireEvent.click(screen.getByTestId("open-spots-visible"));

    await waitFor(() => expect(sign("open-spots")).toHaveAttribute("data-state", "failed"));
    expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "unchecked");
  });

  it("a sub-panel's failure returns it to the confirmed value", async () => {
    await mount();
    await openSection("settings.engine.restrictions");
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));

    fireEvent.click(await screen.findByTestId("stub-restrictions-change"));

    await waitFor(() => expect(sign("restrictions")).toHaveAttribute("data-state", "failed"));
    // The panel is handed the confirmed restrictions again (the card's defaults, 24 h), not the refused 12.
    expect(screen.getByTestId("stub-restrictions-value")).toHaveTextContent('"cancellationDeadlineHours":24');
  });

  it("overlapping saves: an older save failing after a newer one was confirmed keeps the newer value", async () => {
    await mount();
    const older = deferred<NotificationConfig>();
    api.updateNotificationConfig
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch }));

    fireEvent.click(toggle()); // off — save A, held
    await waitFor(() => expect(toggle()).toHaveAttribute("data-state", "unchecked"));
    fireEvent.click(toggle()); // on — save B, confirmed
    await waitFor(() => expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2));
    await act(async () => { older.reject(new Error("late")); });

    expect(toggle()).toHaveAttribute("data-state", "checked");
    await waitFor(() => expect(sign("auto-notify")).toHaveAttribute("data-state", "saved"));
  });

  it("a failure rolls back only its own fields: a confirmed save of another control survives", async () => {
    await mount();
    await openSection("settings.engine.eligibility");
    const master = deferred<NotificationConfig>();
    api.updateNotificationConfig
      .mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch })) // open spots on: ok
      .mockImplementationOnce(() => master.promise); // master off: fails later

    fireEvent.click(screen.getByTestId("open-spots-visible"));
    await waitFor(() => expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "checked"));
    fireEvent.click(toggle());
    await act(async () => { master.reject(new Error("offline")); });

    expect(toggle()).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "checked");
    await waitFor(() => expect(sign("auto-notify")).toHaveAttribute("data-state", "failed"));
  });

  it("a late failure does not undo a newer confirmed change of another control (no stale copy)", async () => {
    await mount();
    await openSection("settings.engine.eligibility");
    const spots = deferred<NotificationConfig>();
    api.updateNotificationConfig
      .mockImplementationOnce(() => spots.promise) // open spots on: held, fails later
      .mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch })); // master off: ok

    fireEvent.click(screen.getByTestId("open-spots-visible"));
    await waitFor(() => expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "checked"));
    fireEvent.click(toggle());
    await waitFor(() => expect(sign("auto-notify")).toHaveAttribute("data-state", "saved"));
    await act(async () => { spots.reject(new Error("offline")); });

    expect(toggle()).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByTestId("open-spots-visible")).toHaveAttribute("data-state", "unchecked");
    await waitFor(() => expect(sign("open-spots")).toHaveAttribute("data-state", "failed"));
  });

  it("an older save failing while a newer one of the same control is still on its way does not put the old value back", async () => {
    await mount();
    const older = deferred<NotificationConfig>();
    const newer = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);

    fireEvent.click(toggle()); // off — held
    await waitFor(() => expect(toggle()).toHaveAttribute("data-state", "unchecked"));
    fireEvent.click(toggle()); // on — held
    await waitFor(() => expect(toggle()).toHaveAttribute("data-state", "checked"));
    await act(async () => { older.reject(new Error("offline")); });
    expect(toggle()).toHaveAttribute("data-state", "checked");

    await act(async () => { newer.resolve({ ...CONFIG, autoNotifyEnabled: true }); });
    expect(toggle()).toHaveAttribute("data-state", "checked");
  });

  it("an older sub-panel save failing while a newer one is on its way keeps the newer value (newest save only)", async () => {
    await mount();
    await openSection("settings.engine.restrictions");
    const older = deferred<NotificationConfig>();
    const newer = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);

    fireEvent.click(await screen.findByTestId("stub-restrictions-change")); // 13, held
    fireEvent.click(screen.getByTestId("stub-restrictions-change")); // 14, held
    await act(async () => { older.reject(new Error("offline")); });
    expect(screen.getByTestId("stub-restrictions-value")).toHaveTextContent('"cancellationDeadlineHours":14');

    await act(async () => { newer.resolve(CONFIG); });
    expect(screen.getByTestId("stub-restrictions-value")).toHaveTextContent('"cancellationDeadlineHours":14');
    await waitFor(() => expect(sign("restrictions")).toHaveAttribute("data-state", "saved"));
  });

  it("rule 3: two held saves both fail — back to the value confirmed before them, not the one the last started from", async () => {
    await mount();
    await openSection("settings.engine.restrictions");
    const y = deferred<NotificationConfig>();
    const z = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => y.promise).mockImplementationOnce(() => z.promise);

    fireEvent.click(await screen.findByTestId("stub-restrictions-change")); // Y: 13
    fireEvent.click(screen.getByTestId("stub-restrictions-change")); // Z: 14, started from 13
    await act(async () => { y.reject(new Error("y")); });
    await act(async () => { z.reject(new Error("z")); });

    expect(screen.getByTestId("stub-restrictions-value")).toHaveTextContent('"cancellationDeadlineHours":24');
    await waitFor(() => expect(sign("restrictions")).toHaveAttribute("data-state", "failed"));
  });

  it("rule 3: the newest fails, then an older save is confirmed — the panel shows what the server confirmed", async () => {
    await mount();
    await openSection("settings.engine.restrictions");
    const y = deferred<NotificationConfig>();
    const z = deferred<NotificationConfig>();
    api.updateNotificationConfig.mockImplementationOnce(() => y.promise).mockImplementationOnce(() => z.promise);

    fireEvent.click(await screen.findByTestId("stub-restrictions-change")); // Y: 13
    fireEvent.click(screen.getByTestId("stub-restrictions-change")); // Z: 14
    await act(async () => { z.reject(new Error("z")); });
    await act(async () => { y.resolve({ ...CONFIG, restrictions: { cancellationDeadlineHours: 13 } } as unknown as NotificationConfig); });

    expect(screen.getByTestId("stub-restrictions-value")).toHaveTextContent('"cancellationDeadlineHours":13');
  });

  it("PAD-478 exception, stated precisely: the reminders request is unchanged and has no sign; its failure returns it to the confirmed value", async () => {
    await mount();
    await openSection("settings.engine.reminders");
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));

    fireEvent.click(await screen.findByTestId("stub-reminders-change"));

    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ reminderTiming: { reminderCount: 3 } });
    expect(screen.queryByTestId("notification-engine-reminders-sign")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("stub-reminders-value")).not.toHaveTextContent('"reminderCount":3'));
  });
});
