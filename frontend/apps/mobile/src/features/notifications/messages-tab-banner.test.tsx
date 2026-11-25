/**
 * PAD-789 — messaging.push-notifications rule 17: the Messages tab shows rule 15's banner above the
 * conversation list, with the thread's cases, for a student and a coach alike. Mounts the real tab
 * and the real banner; expo-notifications and the push registrar are the setup guide's stand-ins
 * (`src/test/setup-guide-fixtures.tsx`), `Linking` is mocked.
 */
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const linking = vi.hoisted(() => ({ openSettings: vi.fn(async () => undefined) }));
// The stub has no RefreshControl; the tab hands one to its list, which the stub never renders.
vi.mock("react-native", async (orig) => ({ ...(await orig<object>()), Linking: linking, RefreshControl: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, useFocusEffect: () => {} }));
vi.mock("expo-notifications", async () => (await import("@/test/setup-guide-fixtures")).notifications);
vi.mock("@/lib/push", async () => {
  const f = await import("@/test/setup-guide-fixtures");
  return { getPushRegistrar: () => f.registrar };
});
const viewer = vi.hoisted(() => ({ roles: ["player"] as string[] }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: 1, roles: viewer.roles } }) }));
vi.mock("@levelup/api/src/resources/messages", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConversations: async () => ({
    conversations: [
      { id: "1", participantId: "p1", participantName: "Person 1", participantRole: "player", lastMessage: "hi", lastMessageAt: "2026-10-14T10:00:00Z", unreadCount: 0, messages: [] },
    ],
    hasMore: false,
  }),
}));
vi.mock("@levelup/api", () => ({ messagesApi: { getConversations: vi.fn() } }));

import { notifications, registrar } from "@/test/setup-guide-fixtures";
import { renderNative } from "@/test/render-native";
import MessagesScreen from "../../../app/(tabs)/messages";

type Case = { name: string; permission: { status: string; canAskAgain?: boolean }; status: string; testId: string | null };

const CASES: Case[] = [
  { name: "never asked", permission: { status: "undetermined", canAskAgain: true }, status: "unknown", testId: "notifications-banner-enable" },
  { name: "refused", permission: { status: "denied", canAskAgain: false }, status: "no-permission", testId: "notifications-banner-enable" },
  { name: "granted, registration failed", permission: { status: "granted" }, status: "failed", testId: "notifications-banner-retry" },
  { name: "granted and registered", permission: { status: "granted" }, status: "registered", testId: null },
  { name: "a simulator, granted", permission: { status: "granted" }, status: "unsupported", testId: null },
];

const mount = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const n = await renderNative(createElement(QueryClientProvider, { client }, createElement(MessagesScreen)));
  await n.flush();
  return n;
};

/** The banner comes before the list in the rendered tree. */
const bannerIsAboveList = (n: Awaited<ReturnType<typeof renderNative>>) => {
  const nodes = n.root.root.findAll(() => true);
  const banner = nodes.findIndex((x) => x.props?.testID === "notifications-banner");
  const list = nodes.findIndex((x) => (x.type as unknown) === "FlatList");
  return banner > -1 && list > -1 && banner < list;
};

beforeEach(() => {
  notifications.getPermissionsAsync.mockClear();
  notifications.requestPermissionsAsync.mockClear();
  registrar.registerIfPermitted.mockClear();
  linking.openSettings.mockClear();
});

describe("Messages tab — the notification banner (rule 17, PAD-789)", () => {
  it("[MESSAGING-PUSH-NOTIFICATIONS-38] the Messages tab shows the banner above the list in each case and prompts only on its tap", async () => {
    for (const roles of [["player"], ["coach"]]) {
      viewer.roles = roles;
      for (const c of CASES) {
        notifications.permission = c.permission;
        notifications.afterRequest = { status: "granted", canAskAgain: true };
        registrar.status = () => c.status;
        const n = await mount();
        const label = `${roles[0]} / ${c.name}`;
        if (c.testId) {
          expect(n.queryByTestId(c.testId), label).not.toBeNull();
          expect(bannerIsAboveList(n), label).toBe(true);
        } else {
          expect(n.queryByTestId("notifications-banner"), label).toBeNull();
        }
        // Rendering the tab never prompts.
        expect(notifications.requestPermissionsAsync, label).not.toHaveBeenCalled();
        n.root.unmount();
      }
    }

    // The never-asked tap is the only prompt; the refused tap opens Settings instead.
    viewer.roles = ["player"];
    notifications.permission = { status: "undetermined", canAskAgain: true };
    registrar.status = () => "unknown";
    const asked = await mount();
    await asked.press("notifications-banner-enable");
    await asked.flush();
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    asked.root.unmount();

    notifications.requestPermissionsAsync.mockClear();
    notifications.permission = { status: "denied", canAskAgain: false };
    const refused = await mount();
    await refused.press("notifications-banner-enable");
    await refused.flush();
    expect(linking.openSettings).toHaveBeenCalledTimes(1);
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    refused.root.unmount();
  });
});
