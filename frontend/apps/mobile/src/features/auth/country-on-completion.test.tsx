/**
 * PAD-604 on iOS (players.invite-completion rule 10a, clubs.coach-invitation rule 8a, auth.activate
 * rule 13a): the three account-completion screens ask for the country (default PT), send it, and
 * put a server COUNTRY_REQUIRED on the field.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({
  acceptPlayer: vi.fn(),
  acceptCoach: vi.fn(),
  activate: vi.fn(),
}));
vi.mock("@levelup/api", () => ({
  playerInvitationsApi: {
    getPlayerInvitation: vi.fn().mockResolvedValue({ playerName: "Ana" }),
    acceptPlayerInvitation: (...a: unknown[]) => api.acceptPlayer(...a),
    claimPlayerInvitation: vi.fn(),
  },
  invitationsApi: {
    getCoachInvitation: vi.fn().mockResolvedValue({ clubName: "Clube" }),
    acceptCoachInvitation: (...a: unknown[]) => api.acceptCoach(...a),
  },
  registerApi: {
    registerUser: vi.fn().mockResolvedValue({ isActive: false, name: "Bruno", username: "bruno", email: "b@example.com", phone: "" }),
    activateAccount: (...a: unknown[]) => api.activate(...a),
  },
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn().mockResolvedValue(undefined), refreshUser: vi.fn().mockResolvedValue(null), user: null, isAuthenticated: false, loading: false }),
}));
vi.mock("@/auth/pendingClaim", () => ({ rememberPendingClaim: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/brand/LevAppMark", () => ({ LevAppMark: () => null }));
vi.mock("@/features/auth/LegalLinks", () => ({ LegalLinks: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));
// The picker's options render as pressables `country-opt-<code>` wired to the Select's
// onValueChange, so a test can choose a country the way the real Select reports it.
const selectHandler = vi.hoisted(() => ({ current: undefined as undefined | ((o: { value: string; label: string }) => void) }));
vi.mock("@/components/ui/select", async () => {
  const { View, Pressable } = await import("react-native");
  const Select = (p: { children?: ReactNode; onValueChange?: (o: { value: string; label: string }) => void }) => {
    selectHandler.current = p.onValueChange;
    return createElement(View, null, p.children);
  };
  const Pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  const Trigger = (p: { testID?: string; children?: ReactNode }) => createElement(View, { testID: p.testID }, p.children);
  const Item = (p: { value: string; label: string }) =>
    createElement(Pressable, { testID: `country-opt-${p.value}`, onPress: () => selectHandler.current?.({ value: p.value, label: p.label }) });
  return { Select, SelectContent: Pass, SelectItem: Item, SelectTrigger: Trigger, SelectValue: () => null };
});
vi.mock("react-native", async (orig) => {
  const rn = await orig<Record<string, unknown>>();
  return { ...rn, Keyboard: { dismiss: () => {} }, KeyboardAvoidingView: rn.View, ActivityIndicator: rn.ActivityIndicator ?? rn.View };
});

import { PlayerInviteScreen } from "./PlayerInviteScreen";
import { CoachInviteScreen } from "./CoachInviteScreen";
import { RegisterScreen } from "./RegisterScreen";

const COUNTRY_REQUIRED = { response: { status: 400, data: { field: "country", code: "COUNTRY_REQUIRED" } } };

async function fill(n: Awaited<ReturnType<typeof renderNative>>, prefix: string, fields: Record<string, string>) {
  for (const [id, v] of Object.entries(fields)) await n.changeText(`${prefix}-${id}`, v);
}
const pw = { password: "Secret123!", repeatPassword: "Secret123!", birthDate: "01011990" };

beforeEach(() => {
  api.acceptPlayer.mockReset();
  api.acceptCoach.mockReset();
  api.activate.mockReset();
});

describe("PlayerInviteScreen — the country (PAD-604)", () => {
  async function mount() {
    const n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    await fill(n, "player-invite", { username: "ana_player", ...pw });
    return n;
  }
  it("shows the country field and sends PT", async () => {
    api.acceptPlayer.mockResolvedValue({ accessToken: "t" });
    const n = await mount();
    expect(n.queryByTestId("player-invite-country")).not.toBeNull();
    await n.press("player-invite-submit");
    await n.flush();
    expect(api.acceptPlayer.mock.calls[0][1]).toMatchObject({ country: "PT" });
  });
  it("puts a server COUNTRY_REQUIRED on the country field", async () => {
    api.acceptPlayer.mockRejectedValue(COUNTRY_REQUIRED);
    const n = await mount();
    await n.press("player-invite-submit");
    await n.flush();
    expect(n.queryByTestId("player-invite-country-error")).not.toBeNull();
  });
  it("sends the country the person picks", async () => {
    api.acceptPlayer.mockResolvedValue({ accessToken: "t", success: true });
    const n = await mount();
    await n.press("country-opt-ES");
    await n.press("player-invite-submit");
    await n.flush();
    expect(api.acceptPlayer.mock.calls[0][1]).toMatchObject({ country: "ES" });
  });
});

describe("CoachInviteScreen — the country (PAD-604)", () => {
  async function mount() {
    const n = await renderNative(createElement(CoachInviteScreen, { token: "tok" }));
    await n.flush();
    await fill(n, "coach-invite", { name: "Rita Coach", username: "rita_coach", email: "rita@example.com", ...pw });
    return n;
  }
  it("shows the country field and sends PT", async () => {
    api.acceptCoach.mockResolvedValue({ accessToken: "t" });
    const n = await mount();
    expect(n.queryByTestId("coach-invite-country")).not.toBeNull();
    await n.press("coach-invite-submit");
    await n.flush();
    expect(api.acceptCoach.mock.calls[0][1]).toMatchObject({ country: "PT" });
  });
  it("puts a server COUNTRY_REQUIRED on the country field", async () => {
    api.acceptCoach.mockRejectedValue(COUNTRY_REQUIRED);
    const n = await mount();
    await n.press("coach-invite-submit");
    await n.flush();
    expect(n.queryByTestId("coach-invite-country-error")).not.toBeNull();
  });
  it("sends the country the person picks", async () => {
    api.acceptCoach.mockResolvedValue({ accessToken: "t", success: true });
    const n = await mount();
    await n.press("country-opt-ES");
    await n.press("coach-invite-submit");
    await n.flush();
    expect(api.acceptCoach.mock.calls[0][1]).toMatchObject({ country: "ES" });
  });
});

describe("RegisterScreen — the country (PAD-604)", () => {
  async function mount() {
    const n = await renderNative(createElement(RegisterScreen, { userId: "5", token: "secret" }));
    await n.flush();
    await fill(n, "register", pw);
    return n;
  }
  it("shows the country field and sends PT", async () => {
    api.activate.mockResolvedValue({ success: true });
    const n = await mount();
    expect(n.queryByTestId("register-country")).not.toBeNull();
    await n.press("register-submit");
    await n.flush();
    expect(api.activate.mock.calls[0][0].content.country).toBe("PT");
  });
  it("puts a server COUNTRY_REQUIRED on the country field", async () => {
    api.activate.mockRejectedValue(COUNTRY_REQUIRED);
    const n = await mount();
    await n.press("register-submit");
    await n.flush();
    expect(n.queryByTestId("register-country-error")).not.toBeNull();
  });
  it("sends the country the person picks", async () => {
    api.activate.mockResolvedValue({ accessToken: "t", success: true });
    const n = await mount();
    await n.press("country-opt-ES");
    await n.press("register-submit");
    await n.flush();
    expect(api.activate.mock.calls[0][0].content.country).toBe("ES");
  });
});
