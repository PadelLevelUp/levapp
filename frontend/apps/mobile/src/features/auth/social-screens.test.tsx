/**
 * auth.social-sign-in rules 2-5 and 7 (PAD-618) on the iOS screens: a provider answer on the sign-in
 * and sign-up screens lands where a password sign-in lands, `needsProfile` opens the completion step
 * with the ticket, and the completion step validates, maps a 400 to its field, shows the expired
 * message, and signs in through the same landing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderNative } from "@/test/render-native";

const login = vi.hoisted(() => vi.fn());
const refreshUser = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }));
const completeSocialSignUp = vi.hoisted(() => vi.fn());
const consumePendingJoin = vi.hoisted(() => vi.fn());
const consumePendingClaim = vi.hoisted(() => vi.fn());
const social = vi.hoisted(() => ({ onResult: null as null | ((r: unknown) => Promise<void>) }));

vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ login, refreshUser, register: vi.fn() }) }));
vi.mock("expo-router", () => ({ router: { replace, push }, useLocalSearchParams: () => params.value }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/brand/LevAppMark", () => ({ LevAppMark: () => null }));
vi.mock("@/features/settings/build-info", () => ({ TestServerNotice: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/lib/config", () => ({
  PRIVACY_POLICY_URL: "https://levapp.app/privacy",
  TERMS_URL: "https://levapp.app/terms",
  legalUrl: (base: string) => base,
}));
vi.mock("@/auth/pendingJoin", () => ({ consumePendingJoin }));
vi.mock("@/auth/pendingClaim", () => ({ consumePendingClaim }));
vi.mock("@levelup/api", () => ({ authApi: { completeSocialSignUp, reapplyCoachApproval: vi.fn() }, getApi: vi.fn() }));
vi.mock("@/features/auth/SocialSignInButtons", () => ({
  SocialSignInButtons: (p: { onResult: (r: unknown) => Promise<void> }) => {
    social.onResult = p.onResult;
    return null;
  },
}));
vi.mock("@/components/ui/select", async () => {
  const { View } = await import("react-native");
  const Pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return { Select: Pass, SelectContent: Pass, SelectItem: () => null, SelectTrigger: Pass, SelectValue: () => null };
});
vi.mock("react-native", async (orig) => {
  const rn = await orig<Record<string, unknown>>();
  return { ...rn, Linking: { openURL: vi.fn() }, Keyboard: { dismiss: () => {} }, KeyboardAvoidingView: rn.View };
});

import LoginScreen from "../../../app/login";
import SignUpScreen from "../../../app/signup";
import SignUpCompleteScreen from "../../../app/signup-complete";

const loginBody = { accessToken: "tok", user: { id: 1, name: "Ana", role: "player" } };
const needsProfile = { needsProfile: true, signupTicket: "ticket-1", name: "Rita Costa", email: "rita@example.com" };

beforeEach(() => {
  [login, refreshUser, replace, push, completeSocialSignUp, consumePendingJoin, consumePendingClaim].forEach((m) => m.mockReset());
  login.mockResolvedValue(undefined);
  refreshUser.mockResolvedValue({ roles: ["student"], coaches: [{ id: 1 }], emailVerification: "verified" });
  params.value = { signupTicket: "ticket-1", name: "Rita Costa", email: "rita@example.com" };
  social.onResult = null;
});

describe.each([
  ["sign-in screen", LoginScreen],
  ["sign-up screen", SignUpScreen],
])("%s: a provider answer", (_name, Screen) => {
  it("a login answer stores the session and lands as a password login does", async () => {
    await renderNative(createElement(Screen));
    await social.onResult!(loginBody);
    expect(login).toHaveBeenCalledWith("tok");
    expect(refreshUser).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/(tabs)/dashboard");
  });

  it("keeps a remembered join link across the provider round-trip", async () => {
    consumePendingJoin.mockReturnValue("join-token");
    await renderNative(createElement(Screen));
    await social.onResult!(loginBody);
    expect(replace).toHaveBeenCalledWith("/join/coach/join-token");
  });

  it("needsProfile opens the completion step with the ticket, name and email", async () => {
    await renderNative(createElement(Screen));
    await social.onResult!(needsProfile);
    expect(login).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({
      pathname: "/signup-complete",
      params: { signupTicket: "ticket-1", name: "Rita Costa", email: "rita@example.com" },
    });
  });
});

async function filled(n: Awaited<ReturnType<typeof renderNative>>, { terms = true, birth = "01012000" } = {}) {
  await n.changeText("social-complete-birthDate", birth);
  if (terms) await n.press("social-complete-terms");
}
const apiError = (status: number, data: Record<string, unknown>) => ({ response: { status, data } });

describe("completion screen", () => {
  it("shows the provider's name and email read-only", async () => {
    const n = await renderNative(createElement(SignUpCompleteScreen));
    expect(n.byTestId("social-complete-name").props.children).toBe("Rita Costa");
    expect(n.byTestId("social-complete-email").props.children).toBe("rita@example.com");
  });

  it("refuses an under-18 birth date on the field and sends nothing", async () => {
    const n = await renderNative(createElement(SignUpCompleteScreen));
    const year = new Date().getFullYear() - 10;
    await filled(n, { birth: `0101${year}` });
    await n.press("social-complete-submit");
    expect(n.byTestId("social-complete-birthDate-error").props.children).toBe("auth.signup.birthDateUnderage");
    expect(completeSocialSignUp).not.toHaveBeenCalled();
  });

  it("requires the Terms", async () => {
    const n = await renderNative(createElement(SignUpCompleteScreen));
    await filled(n, { terms: false });
    await n.press("social-complete-submit");
    expect(n.byTestId("social-complete-terms-error").props.children).toBe("auth.signup.termsRequired");
    expect(completeSocialSignUp).not.toHaveBeenCalled();
  });

  it("requires a birth date", async () => {
    const n = await renderNative(createElement(SignUpCompleteScreen));
    await n.press("social-complete-terms");
    await n.press("social-complete-submit");
    expect(n.byTestId("social-complete-birthDate-error").props.children).toBe("auth.signup.birthDateRequired");
  });

  it("submits role, ISO birth date, country and terms, then lands as a sign-in does", async () => {
    completeSocialSignUp.mockResolvedValue(loginBody);
    const n = await renderNative(createElement(SignUpCompleteScreen));
    await n.press("social-complete-role-coach");
    await filled(n);
    await n.press("social-complete-submit");
    await n.flush();
    expect(completeSocialSignUp).toHaveBeenCalledWith({
      signupTicket: "ticket-1",
      role: "coach",
      birthDate: "2000-01-01",
      country: "PT",
      termsAccepted: true,
    });
    expect(login).toHaveBeenCalledWith("tok");
    expect(replace).toHaveBeenCalledWith("/(tabs)/dashboard");
  });

  it("maps a server 400 to its field in sign-up's words", async () => {
    completeSocialSignUp.mockRejectedValue(apiError(400, { error: "x", field: "birthDate", code: "UNDERAGE" }));
    const n = await renderNative(createElement(SignUpCompleteScreen));
    await filled(n);
    await n.press("social-complete-submit");
    await n.flush();
    expect(n.byTestId("social-complete-birthDate-error").props.children).toBe("auth.signup.birthDateUnderage");
    expect(login).not.toHaveBeenCalled();
  });

  it("an invalid ticket shows the expired message with a way back to sign-up", async () => {
    completeSocialSignUp.mockRejectedValue(apiError(401, { error: "INVALID_SIGNUP_TICKET" }));
    const n = await renderNative(createElement(SignUpCompleteScreen));
    await filled(n);
    await n.press("social-complete-submit");
    await n.flush();
    expect(n.queryByTestId("social-complete-expired")).not.toBeNull();
    await n.press("social-complete-back");
    expect(replace).toHaveBeenCalledWith("/signup");
  });

  it("missing params show the expired message too", async () => {
    params.value = {};
    const n = await renderNative(createElement(SignUpCompleteScreen));
    expect(n.queryByTestId("social-complete-expired")).not.toBeNull();
    expect(n.queryByTestId("social-complete")).toBeNull();
  });

  it("ALREADY_COMPLETED says the account exists", async () => {
    completeSocialSignUp.mockRejectedValue(apiError(409, { error: "ALREADY_COMPLETED" }));
    const n = await renderNative(createElement(SignUpCompleteScreen));
    await filled(n);
    await n.press("social-complete-submit");
    await n.flush();
    expect(n.byTestId("social-complete-error").props.children).toBe("auth.social.complete.alreadyCompleted");
  });
});
