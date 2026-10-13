/**
 * auth.register rule 21 (PAD-651, B-528) on iOS — the twin of web's SignUpPage.username tests: the
 * username follows a suggestion from the name until the user types in it, an email typed as the
 * username gets its own message, and one account is sent once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderNative } from "@/test/render-native";

const register = vi.fn();
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ register }) }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/brand/LevAppMark", () => ({ LevAppMark: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));
vi.mock("@/lib/config", () => ({
  PRIVACY_POLICY_URL: "https://levapp.app/privacy",
  TERMS_URL: "https://levapp.app/terms",
  // PAD-601: the real helper, so the test sees the ?lang= the app sends.
  legalUrl: (base: string, language: string | undefined) =>
    `${base}?lang=${(language ?? "").toLowerCase().startsWith("pt") ? "pt" : "en"}`,
}));
vi.mock("@/auth/pendingJoin", () => ({ consumePendingJoin: () => null }));
vi.mock("@/auth/pendingClaim", () => ({ consumePendingClaim: () => null }));
vi.mock("@/components/ui/select", async () => {
  const { View } = await import("react-native");
  const Pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return { Select: Pass, SelectContent: Pass, SelectItem: () => null, SelectTrigger: Pass, SelectValue: () => null };
});
const openURL = vi.hoisted(() => vi.fn());
vi.mock("react-native", async (orig) => {
  // The test stub of react-native has no Linking, Keyboard or KeyboardAvoidingView; the screen needs them.
  const rn = await orig<Record<string, unknown>>();
  return { ...rn, Linking: { openURL }, Keyboard: { dismiss: () => {} }, KeyboardAvoidingView: rn.View, ActivityIndicator: rn.ActivityIndicator ?? rn.View };
});

import SignUpScreen from "../../../app/signup";

const text = (n: Awaited<ReturnType<typeof renderNative>>, id: string) =>
  String([n.byTestId(id).props.children].flat().join(""));

async function filled(username: string) {
  const n = await renderNative(createElement(SignUpScreen));
  await n.changeText("signup-name", "Jorge Torres");
  await n.changeText("signup-username", username);
  await n.changeText("signup-email", "jorge.torres@gmail.com");
  await n.changeText("signup-password", "Segura123");
  await n.changeText("signup-repeatPassword", "Segura123");
  await n.changeText("signup-birthDate", "01012000");
  await n.press("signup-terms");
  return n;
}

beforeEach(() => {
  register.mockReset();
  openURL.mockReset().mockResolvedValue(true);
});

describe("SignUpScreen — the username explains itself (PAD-651, auth.register rule 21)", () => {
  it("21a: the name pre-fills the username, until the user types in it", async () => {
    const n = await renderNative(createElement(SignUpScreen));
    await n.changeText("signup-name", "Jorge Torres");
    expect(n.byTestId("signup-username").props.value).toBe("jorge.torres");
    await n.changeText("signup-username", "JPT");
    await n.changeText("signup-name", "Jorge P. Torres");
    expect(n.byTestId("signup-username").props.value).toBe("JPT");
  });

  it("21b: an email typed as the username gets its own message, and nothing is sent", async () => {
    const n = await filled("jorge.torres@gmail.com");
    await n.press("signup-submit");
    expect(text(n, "signup-error-username")).toBe("auth.signup.usernameIsEmail");
    expect(register).not.toHaveBeenCalled();
  });

  it("21c: a second tap while the sign-up is in flight sends nothing", async () => {
    register.mockReturnValue(new Promise(() => {}));
    const n = await filled("jpt");
    await n.press("signup-submit");
    await n.press("signup-submit");
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("21c: after the account exists, the form never sends again", async () => {
    register.mockResolvedValue({ user: { id: 1, roles: ["student"], emailVerification: "pending" } });
    const n = await filled("jpt");
    await n.press("signup-submit");
    await n.flush();
    await n.press("signup-submit");
    await n.flush();
    expect(register).toHaveBeenCalledTimes(1);
    expect(n.byTestId("signup-submit").props.disabled).toBe(true);
  });
});
