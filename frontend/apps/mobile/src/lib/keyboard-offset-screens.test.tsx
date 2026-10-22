/**
 * mobile.android-runtime rule 2 (PAD-487, B-265): a screen under a NATIVE stack header passes the
 * header's height to its KeyboardAvoidingView as `keyboardVerticalOffset`, or the view shrinks too
 * little and the bottom of the form (the wizard's notes field) stays under the keyboard. Both such
 * screens are mounted and their keyboard view must carry exactly the hook's value. The hook is a
 * stand-in returning 97; everything the screens fetch is a request that never answers, through
 * the real @levelup/hooks and react-query (since PAD-406) in a real QueryClientProvider.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

const HEADER = 97;

vi.mock("@/lib/keyboard-avoiding", () => ({ keyboardAvoidingBehavior: () => "padding" }));
vi.mock("@/lib/native-header-offset", () => ({ useNativeHeaderKeyboardOffset: () => HEADER }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const never = vi.hoisted(() => () => new Promise<never>(() => undefined));
vi.mock("@levelup/api/src/resources/classRequests", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listClassRequestCoaches: never,
}));
vi.mock("@levelup/api/src/resources/messages", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConversations: never,
}));
vi.mock("@levelup/api", () => ({ messagesApi: { createConversation: vi.fn() } }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/features/messages/hooks", () => ({
  useMessageableUsers: () => ({ data: [], isLoading: true, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/features/class-requests/wizard/AcademyClassStep", () => ({ AcademyClassStep: () => null }));
vi.mock("@/features/class-requests/wizard/CoachStep", () => ({ CoachStep: () => null }));
vi.mock("@/features/class-requests/wizard/KindStep", () => ({ KindStep: () => null }));
vi.mock("@/features/class-requests/wizard/PrivateClassStep", () => ({ PrivateClassStep: () => null }));

import ClassRequestWizardScreen from "../../app/class-request-wizard";
import NewConversationScreen from "../../app/conversation/new";

type N = Awaited<ReturnType<typeof renderNative>>;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

const keyboardViews = (n: N) =>
  n.root.root.findAll((node) => String(node.type) === "KeyboardAvoidingView");

describe("screens under a native header offset the keyboard by its height (PAD-487)", () => {
  it.each([
    ["the class-request wizard", ClassRequestWizardScreen],
    ["the new-conversation screen", NewConversationScreen],
  ])("%s", async (_name, Screen) => {
    const n = await renderNative(
      <QueryClientProvider client={client}>
        <Screen />
      </QueryClientProvider>
    );
    const [kav, ...others] = keyboardViews(n);
    expect(others).toHaveLength(0);
    expect(kav.props.behavior).toBe("padding");
    expect(kav.props.keyboardVerticalOffset).toBe(HEADER);
  });
});
