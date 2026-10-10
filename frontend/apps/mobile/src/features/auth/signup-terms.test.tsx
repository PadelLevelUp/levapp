/**
 * auth.register rule 19 (PAD-485) on iOS — the twin of web's SignUpPage tests: the Terms box is
 * required, the sign-up sends `termsAccepted: true`, both documents open from the box, and a server
 * TERMS_REQUIRED lands on it.
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

async function filled({ terms = true } = {}) {
  const n = await renderNative(createElement(SignUpScreen));
  await n.changeText("signup-name", "Ana Silva");
  await n.changeText("signup-username", "ana");
  await n.changeText("signup-email", "ana@example.com");
  await n.changeText("signup-password", "Segura123");
  await n.changeText("signup-repeatPassword", "Segura123");
  await n.changeText("signup-birthDate", "01012000");
  if (terms) await n.press("signup-terms");
  return n;
}

beforeEach(() => {
  register.mockReset();
  openURL.mockReset().mockResolvedValue(true);
});

describe("SignUpScreen — the Terms must be accepted (PAD-485, auth.register rule 19)", () => {
  it("unticked, nothing is sent and the box says why", async () => {
    const n = await filled({ terms: false });
    await n.press("signup-submit");
    expect(n.queryByTestId("signup-error-terms")).not.toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it("ticked, the sign-up sends termsAccepted: true", async () => {
    register.mockResolvedValue({ user: { id: 1, roles: ["student"], emailVerification: "pending" } });
    const n = await filled();
    expect(n.byTestId("signup-terms").props.accessibilityState.checked).toBe(true);
    await n.press("signup-submit");
    await n.flush();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toMatchObject({ termsAccepted: true });
  });

  it("both documents open from the box", async () => {
    const n = await renderNative(createElement(SignUpScreen));
    await n.press("signup-terms-privacy");
    await n.press("signup-terms-terms");
    // auth.legal-pages rule 3 (PAD-601): the hosted pages open in the account's language.
    expect(openURL.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/\/privacy\?lang=(en|pt)$/),
      expect.stringMatching(/\/terms\?lang=(en|pt)$/),
    ]);
  });

  it("maps a server TERMS_REQUIRED to the box", async () => {
    register.mockRejectedValue({ response: { status: 400, data: { field: "terms", code: "TERMS_REQUIRED", error: "…" } } });
    const n = await filled();
    await n.press("signup-submit");
    await n.flush();
    expect(n.queryByTestId("signup-error-terms")).not.toBeNull();
  });

  it("one owner of the toggle: the box inside the Pressable takes no touches (#517 review)", async () => {
    const n = await renderNative(createElement(SignUpScreen));
    const box = n.byTestId("signup-terms");
    const inert = box.findAll((node) => node.props.pointerEvents === "none");
    expect(inert.length).toBeGreaterThan(0);
  });
});
