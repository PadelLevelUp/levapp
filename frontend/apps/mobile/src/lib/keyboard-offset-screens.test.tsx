/**
 * mobile.android-runtime rule 2 (PAD-487, B-265): a screen under a NATIVE stack header passes the
 * header's height to its KeyboardAvoidingView as `keyboardVerticalOffset`, or the view shrinks too
 * little and the bottom of the form (the wizard's notes field) stays under the keyboard. Both such
 * screens are mounted and their keyboard view must carry exactly the hook's value. The hook is a
 * stand-in returning 97; everything the screens fetch is stubbed.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

const HEADER = 97;

vi.mock("@/lib/keyboard-avoiding", () => ({ keyboardAvoidingBehavior: () => "padding" }));
vi.mock("@/lib/native-header-offset", () => ({ useNativeHeaderKeyboardOffset: () => HEADER }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: { push: vi.fn(), back: vi.fn(), replace: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: true, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@levelup/api/src/resources/classRequests", () => ({ listClassRequestCoaches: vi.fn() }));
vi.mock("@levelup/api", () => ({ messagesApi: { createConversation: vi.fn() } }));
vi.mock("@levelup/hooks", () => ({
  queryKeys: { classRequestCoaches: ["class-request-coaches"] },
  useConversations: () => ({ data: undefined }),
}));
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
const keyboardViews = (n: N) =>
  n.root.root.findAll((node) => String(node.type) === "KeyboardAvoidingView");

describe("screens under a native header offset the keyboard by its height (PAD-487)", () => {
  it.each([
    ["the class-request wizard", ClassRequestWizardScreen],
    ["the new-conversation screen", NewConversationScreen],
  ])("%s", async (_name, Screen) => {
    const n = await renderNative(<Screen />);
    const [kav, ...others] = keyboardViews(n);
    expect(others).toHaveLength(0);
    expect(kav.props.behavior).toBe("padding");
    expect(kav.props.keyboardVerticalOffset).toBe(HEADER);
  });
});
