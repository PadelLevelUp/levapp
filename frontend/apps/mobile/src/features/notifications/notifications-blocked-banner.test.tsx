/**
 * messaging.push-notifications rule 15 (PAD-744): the banner's grant registers the phone, and a
 * phone whose registration failed shows "not active" with a button that registers again.
 */
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: (p: Record<string, unknown>) => createElement(Text, p) };
});

const permission = vi.hoisted(() => ({ current: { status: "undetermined", canAskAgain: true } as Record<string, unknown>, afterRequest: { status: "granted" } as Record<string, unknown> }));
vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(async () => permission.current),
  requestPermissionsAsync: vi.fn(async () => (permission.current = permission.afterRequest)),
}));

const registrar = vi.hoisted(() => {
  let status = "unknown";
  const listeners = new Set<(s: string) => void>();
  return {
    registerIfPermitted: vi.fn(async () => undefined),
    status: () => status,
    onStatusChange: (l: (s: string) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    emit(next: string) {
      status = next;
      for (const l of listeners) l(next);
    },
    reset() {
      status = "unknown";
      listeners.clear();
    },
  };
});
vi.mock("@/lib/push", () => ({ getPushRegistrar: () => registrar }));

import { act } from "react-test-renderer";
import { renderNative } from "@/test/render-native";
import { NotificationsBlockedBanner } from "./notifications-blocked-banner";

const textOf = (view: Awaited<ReturnType<typeof renderNative>>) =>
  view.root.root.findAll((n) => typeof n.props?.children === "string").map((n) => n.props.children as string);

beforeEach(() => {
  registrar.reset();
  registrar.registerIfPermitted.mockClear();
  permission.current = { status: "undetermined", canAskAgain: true };
  permission.afterRequest = { status: "granted" };
});

describe("NotificationsBlockedBanner (rule 15)", () => {
  it("a grant from the banner registers the phone, without a second prompt, and the banner goes", async () => {
    const view = await renderNative(<NotificationsBlockedBanner />);
    await view.flush();
    expect(view.byTestId("notifications-banner-enable")).toBeTruthy();
    await view.press("notifications-banner-enable");
    await view.flush();
    expect(registrar.registerIfPermitted).toHaveBeenCalledTimes(1);
    await act(async () => registrar.emit("registered"));
    expect(view.queryByTestId("notifications-banner")).toBeNull();
  });

  it("a refusal from the banner registers nothing", async () => {
    permission.afterRequest = { status: "denied", canAskAgain: false };
    const view = await renderNative(<NotificationsBlockedBanner />);
    await view.flush();
    await view.press("notifications-banner-enable");
    await view.flush();
    expect(registrar.registerIfPermitted).not.toHaveBeenCalled();
  });

  it("granted but failed shows 'not active' with a button that registers again", async () => {
    permission.current = { status: "granted" };
    const view = await renderNative(<NotificationsBlockedBanner />);
    await view.flush();
    expect(view.queryByTestId("notifications-banner")).toBeNull();

    await act(async () => registrar.emit("failed"));
    expect(textOf(view)).toContain("messages.notificationsInactiveDevice");
    expect(view.queryByTestId("notifications-banner-enable")).toBeNull();
    await view.press("notifications-banner-retry");
    expect(registrar.registerIfPermitted).toHaveBeenCalledTimes(1);
  });
});
