/**
 * settings.save-on-change rules 2-3 + B-243 (PAD-473) on the iOS engine card, the twin of web's
 * NotificationsEngineSection test: every control signs its save; a failure says so and returns only
 * the fields whose newest save failed to the last value the server confirmed. Sub-panels are stubs.
 */
import * as React from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __emitAppState, __resetReactNativeMock } from "@/test/mocks/react-native";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const api = vi.hoisted(() => ({ getNotificationConfig: vi.fn(), updateNotificationConfig: vi.fn() }));
vi.mock("@levelup/api", () => ({ notificationEngineApi: api }));

const clicks = vi.hoisted(() => ({ n: 0 }));
vi.mock("./eligibility-section", async () => {
  const { Pressable } = await import("react-native");
  return {
    EligibilitySection: (p: { onChange: (v: unknown) => void }) =>
      React.createElement(Pressable, { testID: "stub-eligibility-change", onPress: () => p.onChange([{ attribute: "level" }]) }),
  };
});
vi.mock("./eligibility-impact-note", () => ({ EligibilityImpactNote: () => null }));
vi.mock("./restrictions-section", async () => {
  const { Pressable, Text, View } = await import("react-native");
  return {
    RestrictionsSection: (p: { restrictions: unknown; onChange: (v: unknown) => void }) =>
      React.createElement(View, null,
        React.createElement(Text, { testID: "stub-restrictions-value" }, JSON.stringify(p.restrictions)),
        React.createElement(Pressable, {
          testID: "stub-restrictions-change",
          onPress: () => p.onChange({ cancellationDeadlineHours: 12 + ++clicks.n }),
        }),
      ),
  };
});

import { AutoInviteSection } from "./auto-invite-section";

const CONFIG = {
  autoNotifyEnabled: true,
  invitationMode: "automatic",
  openSpotsVisible: false,
  eligibilityRules: null,
  restrictions: {},
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
type N = Awaited<ReturnType<typeof renderNative>>;
const on = (n: N, id: string) => n.byTestId(id).props.accessibilityState?.checked ?? n.byTestId(id).props["aria-checked"] ?? n.byTestId(id).props.checked;
const signText = (n: N, id: string) =>
  n.byTestId(id).findAll((x) => typeof x.props.children === "string").map((x) => x.props.children).join("");
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

beforeEach(() => {
  clicks.n = 0;
  __resetReactNativeMock();
  api.getNotificationConfig.mockReset().mockResolvedValue(CONFIG);
  api.updateNotificationConfig.mockReset().mockImplementation(async (patch: object) => ({ ...CONFIG, ...patch }));
});

async function mount() {
  const n = await renderNative(<AutoInviteSection />);
  await n.flush();
  return n;
}

describe("iOS engine card (settings.save-on-change, B-243)", () => {
  it("the master toggle saves and signs", async () => {
    const n = await mount();
    await n.toggle("settings-auto-invite-toggle");
    await n.flush();
    expect(api.updateNotificationConfig).toHaveBeenCalledWith({ autoNotifyEnabled: false });
    await wait(700);
    expect(signText(n, "settings-auto-invite-sign")).toContain("settings.saveSign.saved");
  });

  it("eligibility, invitation mode and restrictions sign under their own keys", async () => {
    const n = await mount();
    await n.press("stub-eligibility-change");
    await n.press("settings-invite-mode-semi");
    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change");
    await n.flush();
    await wait(700);
    for (const id of ["settings-eligibility-sign", "settings-invite-mode-sign", "settings-restrictions-sign"]) {
      expect(signText(n, id)).toContain("settings.saveSign.saved");
    }
  });

  it("open spots: a failure says so and shows the confirmed value", async () => {
    const n = await mount();
    api.updateNotificationConfig.mockRejectedValueOnce(new Error("offline"));
    await n.toggle("open-spots-visible");
    await n.flush();
    expect(signText(n, "settings-open-spots-sign")).toContain("settings.saveSign.failed");
    expect(on(n, "open-spots-visible")).toBe(false);
  });

  it("a late failure does not undo a newer confirmed change of another control", async () => {
    const n = await mount();
    const spots = deferred<unknown>();
    api.updateNotificationConfig
      .mockImplementationOnce(() => spots.promise)
      .mockImplementationOnce(async (patch: object) => ({ ...CONFIG, ...patch }));

    await n.toggle("open-spots-visible");
    await n.toggle("settings-auto-invite-toggle");
    await n.flush();
    await act(async () => { spots.reject(new Error("offline")); });
    await n.flush();

    expect(on(n, "settings-auto-invite-toggle")).toBe(false);
    expect(on(n, "open-spots-visible")).toBe(false);
    expect(signText(n, "settings-open-spots-sign")).toContain("settings.saveSign.failed");
  });

  it("an older save failing while a newer one of the same control is on its way keeps the newer value", async () => {
    const n = await mount();
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    api.updateNotificationConfig.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);

    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change"); // 13, held
    await n.press("stub-restrictions-change"); // 14, held
    await act(async () => { older.reject(new Error("offline")); });
    await n.flush();
    expect(n.byTestId("stub-restrictions-value").props.children).toContain('"cancellationDeadlineHours":14');

    await act(async () => { newer.resolve(CONFIG); });
    await n.flush();
    expect(n.byTestId("stub-restrictions-value").props.children).toContain('"cancellationDeadlineHours":14');
  });

  it("rule 3: two held saves both fail — back to the value confirmed before them", async () => {
    const n = await mount();
    const y = deferred<unknown>();
    const z = deferred<unknown>();
    api.updateNotificationConfig.mockImplementationOnce(() => y.promise).mockImplementationOnce(() => z.promise);

    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change"); // Y: 13
    await n.press("stub-restrictions-change"); // Z: 14, started from 13
    await act(async () => { y.reject(new Error("y")); });
    await act(async () => { z.reject(new Error("z")); });
    await n.flush();

    expect(n.byTestId("stub-restrictions-value").props.children).toContain('"cancellationDeadlineHours":24');
  });

  it("rule 3: the first is confirmed, the waiting newer one fails — shows what the server confirmed", async () => {
    const n = await mount();
    const y = deferred<unknown>();
    const z = deferred<unknown>();
    api.updateNotificationConfig.mockImplementationOnce(() => y.promise).mockImplementationOnce(() => z.promise);

    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change"); // Y: 13, sent
    await n.press("stub-restrictions-change"); // Z: 14, waits
    await act(async () => { y.resolve({ ...CONFIG, restrictions: { cancellationDeadlineHours: 13 } }); });
    await n.flush();
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2);
    await act(async () => { z.reject(new Error("z")); });
    await n.flush();

    expect(n.byTestId("stub-restrictions-value").props.children).toContain('"cancellationDeadlineHours":13');
  });

  it("rule 3: one engine save in flight — a change made meanwhile waits and is sent when it returns", async () => {
    const n = await mount();
    const first = deferred<unknown>();
    api.updateNotificationConfig.mockImplementationOnce(() => first.promise);

    await n.toggle("settings-auto-invite-toggle"); // off — sent
    await n.toggle("open-spots-visible"); // waits
    await n.flush();
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve({ ...CONFIG, autoNotifyEnabled: false }); });
    await n.flush();

    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2);
    expect(api.updateNotificationConfig).toHaveBeenLastCalledWith({ openSpotsVisible: true });
  });

  it("review #497 round 2: changes to two controls made while a save is out are merged into the next request, neither lost", async () => {
    const n = await mount();
    const first = deferred<unknown>();
    api.updateNotificationConfig.mockImplementationOnce(() => first.promise);

    await n.toggle("open-spots-visible"); // sent
    await n.toggle("settings-auto-invite-toggle"); // master off — waits
    await n.press("settings-restrictions-header");
    await n.press("stub-restrictions-change"); // restrictions 13 — waits, merged
    await n.flush();
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve({ ...CONFIG, openSpotsVisible: true }); });
    await n.flush();

    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2);
    expect(api.updateNotificationConfig).toHaveBeenLastCalledWith({
      autoNotifyEnabled: false,
      restrictions: { cancellationDeadlineHours: 13 },
    });
  });

  it("review #497: on leaving the foreground an engine save waiting behind one in flight is sent at once", async () => {
    const n = await mount();
    api.updateNotificationConfig.mockImplementationOnce(() => new Promise(() => undefined));

    await n.toggle("settings-auto-invite-toggle"); // out, never answers
    await n.toggle("open-spots-visible"); // waits
    await n.flush();
    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(1);
    await act(async () => { __emitAppState("background"); });

    expect(api.updateNotificationConfig).toHaveBeenCalledTimes(2);
    expect(api.updateNotificationConfig).toHaveBeenLastCalledWith({ openSpotsVisible: true });
  });
});
