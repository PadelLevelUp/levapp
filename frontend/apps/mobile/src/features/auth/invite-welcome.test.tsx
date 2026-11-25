/**
 * auth.invite-welcome (UI idea 8) on iOS: the join screen and the two invitation screens put each state's heading
 * and description on the navy, outside the card; the card holds the controls. The shared pieces (Register, the legal
 * catch-up, the invalid notices) look as they do today. `t` returns the key and, given values, the values.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { renderNative } from "@/test/render-native";

const auth = vi.hoisted(() => ({ user: null as null | { roles: string[]; name?: string }, isAuthenticated: false }));
const api = vi.hoisted(() => ({
  joinPreview: vi.fn(),
  joinAccept: vi.fn(),
  coachInvitation: vi.fn(),
  playerInvitation: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@levelup/api", () => ({
  joinTokensApi: {
    previewJoinToken: (...a: unknown[]) => api.joinPreview(...a),
    acceptJoinToken: (...a: unknown[]) => api.joinAccept(...a),
  },
  playerInvitationsApi: {
    getPlayerInvitation: (...a: unknown[]) => api.playerInvitation(...a),
    acceptPlayerInvitation: vi.fn(),
    claimPlayerInvitation: (...a: unknown[]) => api.claim(...a),
  },
  invitationsApi: { getCoachInvitation: (...a: unknown[]) => api.coachInvitation(...a), acceptCoachInvitation: vi.fn() },
  registerApi: { registerUser: vi.fn(), activateAccount: vi.fn() },
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(null),
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    loading: false,
  }),
}));
vi.mock("@/auth/pendingClaim", () => ({ rememberPendingClaim: vi.fn() }));
vi.mock("@/auth/pendingJoin", () => ({ rememberPendingJoin: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn(), push: vi.fn() }, Redirect: () => null }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/brand/LevAppMark", async () => {
  const { createElement: h } = await import("react");
  return { LevAppMark: ({ size }: { size?: number }) => h("Mark", { size }) };
});
vi.mock("@/features/auth/LegalLinks", () => ({ LegalLinks: () => null }));
vi.mock("@/lib/config", () => ({ PRIVACY_POLICY_URL: "p", TERMS_URL: "t", legalUrl: (b: string) => b }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}|${Object.values(values).join("|")}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/components/ui/select", async () => {
  const { View } = await import("react-native");
  const Pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return { Select: Pass, SelectContent: Pass, SelectItem: () => null, SelectTrigger: Pass, SelectValue: () => null };
});
vi.mock("react-native", async (orig) => {
  const rn = await orig<Record<string, unknown>>();
  return { ...rn, Keyboard: { dismiss: () => {} }, KeyboardAvoidingView: rn.View, ActivityIndicator: rn.ActivityIndicator ?? rn.View };
});

import { JoinCoachScreen } from "@/features/players/JoinCoachScreen";
import { CoachInviteScreen } from "./CoachInviteScreen";
import { PlayerInviteScreen } from "./PlayerInviteScreen";
import { RegisterScreen } from "./RegisterScreen";
import { AccountSetupNotice } from "./AccountSetupScreen";
import LegalCatchUpScreen from "../../../app/legal-catch-up";

type N = Awaited<ReturnType<typeof renderNative>>;
const PREVIEW = { coachName: "Coach Name", clubName: "Club Name", clubLogoUrl: "https://cdn.test/logo.png" };

/** Every string the screen draws. */
function texts(n: N): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (x == null) return;
    if (typeof x === "string") out.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else walk((x as { children?: unknown }).children);
  };
  walk(n.root.toJSON());
  return out;
}
const inside = (el: ReactTestInstance, id: string) =>
  el.findAll((x) => x.props?.testID === id && typeof x.type === "string").length > 0;
const bandOf = (n: N) => n.byTestId("invite-band");
const bandText = (n: N) => {
  const out: string[] = [];
  const walk = (x: ReactTestInstance | string) => (typeof x === "string" ? out.push(x) : x.children.forEach(walk));
  walk(bandOf(n));
  return out.join(" ");
};
/** The band's heading is a Text with role heading, level 3, as the cards' titles were. */
function expectBand(n: N, title: string, description: string) {
  const band = bandOf(n);
  const heading = band.findAll((x) => x.props?.role === "heading" && typeof x.type === "string")[0];
  expect(heading, "a heading on the band").toBeTruthy();
  expect(heading.props["aria-level"]).toBe(3);
  expect(bandText(n)).toContain(title);
  expect(bandText(n)).toContain(description);
}

beforeEach(() => {
  auth.user = null;
  auth.isAuthenticated = false;
  api.joinPreview.mockReset().mockResolvedValue(PREVIEW);
  api.joinAccept.mockReset().mockResolvedValue({ coachName: "Coach Name", clubName: "Club Name", alreadyMember: false });
  api.coachInvitation.mockReset().mockResolvedValue({ clubName: "Club Name" });
  api.playerInvitation.mockReset().mockResolvedValue({ playerName: "Ana" });
  api.claim.mockReset().mockResolvedValue({ coachName: "Coach Name" });
});

describe("the iOS invite screens' navy (auth.invite-welcome rules 2-4)", () => {
  it("[AUTH-INVITE-WELCOME-2] every state shows its words on the navy and keeps its controls", async () => {
    // Join, signed out.
    let n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "players.joinCoach.signInTitle|Coach Name", "players.joinCoach.signInDescription");
    expect(bandText(n)).toContain("Club Name");
    const card = n.byTestId("join-coach-signed-out");
    expect(inside(card, "join-coach-create-account") && inside(card, "join-coach-sign-in")).toBe(true);
    // The title is outside the card.
    expect(card.findAll((x) => x.props?.role === "heading" && typeof x.type === "string").length).toBe(0);

    // Join, preview.
    auth.isAuthenticated = true;
    auth.user = { roles: ["student"] };
    n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "players.joinCoach.prompt|Coach Name|Club Name", "players.joinCoach.explain|Coach Name");
    expect(bandText(n)).toContain("Club Name");
    expect(inside(n.byTestId("join-coach-preview"), "join-coach-confirm")).toBe(true);
    await n.press("join-coach-confirm");
    await n.flush();
    expectBand(n, "players.joinCoach.successTitle|Coach Name", "players.joinCoach.successDescription|Coach Name|Club Name");
    expect(inside(n.byTestId("join-coach-success"), "join-coach-go-calendar")).toBe(true);

    // Join, a coach opens the link.
    auth.user = { roles: ["coach"] };
    n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "players.joinCoach.coachTitle", "players.joinCoach.coachDescription");
    n.byTestId("join-coach-is-coach");

    // The coach invitation form.
    auth.user = null;
    auth.isAuthenticated = false;
    n = await renderNative(createElement(CoachInviteScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "auth.coachInvite.title|Club Name", "auth.coachInvite.description");
    expect(inside(n.byTestId("coach-invite"), "coach-invite-submit")).toBe(true);

    // The player invitation: form, claim, coach, claimed.
    n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "auth.playerInvite.title|Ana", "auth.playerInvite.description");
    expect(inside(n.byTestId("player-invite"), "player-invite-submit")).toBe(true);

    auth.isAuthenticated = true;
    auth.user = { roles: ["student"], name: "Ana" };
    n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "auth.playerInvite.claimTitle", "auth.playerInvite.claimDescription|Ana");
    await n.press("invite-claim-confirm");
    await n.flush();
    expectBand(n, "auth.playerInvite.claimSuccessTitle", "auth.playerInvite.claimSuccessDescription|Coach Name");
    n.byTestId("invite-claim-success-action");

    auth.user = { roles: ["coach"] };
    n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    expectBand(n, "auth.playerInvite.claimIsCoachTitle", "auth.playerInvite.claimIsCoachDescription");
  });

  it("[AUTH-INVITE-WELCOME-2] the join screen's loading and invalid stay as they are: the 30pt mark, no scroll view, no band", async () => {
    api.joinPreview.mockRejectedValue(new Error("404"));
    let n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    await n.flush();
    const invalid = n.byTestId("join-coach-invalid");
    expect(invalid).toBeTruthy();
    expect(n.queryByTestId("invite-band")).toBeNull();
    expect(n.root.root.findAll((x) => (x.type as unknown) === "ScrollView").length).toBe(0);
    expect(n.root.root.findAll((x) => (x.type as unknown) === "Mark").map((m) => m.props.size)).toEqual([30]);

    // Loading: the preview has not answered.
    api.joinPreview.mockReturnValue(new Promise(() => undefined));
    n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    n.byTestId("join-coach-loading");
    expect(n.queryByTestId("invite-band")).toBeNull();
    expect(n.root.root.findAll((x) => (x.type as unknown) === "ScrollView").length).toBe(0);
    expect(n.root.root.findAll((x) => (x.type as unknown) === "Mark").map((m) => m.props.size)).toEqual([30]);
  });

  it("[AUTH-INVITE-WELCOME-2] the shared screens do not change: invalid notices, Register and the legal catch-up keep their card header", async () => {
    api.playerInvitation.mockRejectedValue(new Error("410"));
    let n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    expect(n.queryByTestId("invite-band")).toBeNull();
    n.byTestId("player-invite-invalid");

    n = await renderNative(
      createElement(AccountSetupNotice, { title: "T", description: "D", actionLabel: "A", onAction: () => {}, testID: "plain-notice" })
    );
    expect(n.queryByTestId("invite-band")).toBeNull();
    expect(n.byTestId("plain-notice").findAll((x) => x.props?.role === "heading" && typeof x.type === "string").length).toBe(1);

    // The legal catch-up (a signed-in user whose Terms are pending): its card keeps its own heading, no band.
    auth.isAuthenticated = true;
    auth.user = { roles: ["player"], id: 7, legalPending: { terms: true, birthDate: false } } as never;
    n = await renderNative(createElement(LegalCatchUpScreen));
    await n.flush();
    n.byTestId("legal-catch-up");
    expect(n.queryByTestId("invite-band")).toBeNull();
    expect(n.byTestId("legal-catch-up").findAll((x) => x.props?.role === "heading" && typeof x.type === "string").length).toBe(1);
    auth.isAuthenticated = false;
    auth.user = null;

    n = await renderNative(createElement(RegisterScreen, { userId: null, token: null } as never));
    await n.flush();
    expect(n.queryByTestId("invite-band")).toBeNull();
  });

  it("[AUTH-INVITE-WELCOME-3] the signed-out screens reveal only the listed facts", async () => {
    api.joinPreview.mockResolvedValue({ ...PREVIEW, coachEmail: "LEAK-coach-email", clubId: "LEAK-club-id" });
    let n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    await n.flush();
    let all = texts(n).join(" ");
    expect(all).toContain("Coach Name");
    expect(all).toContain("Club Name");
    expect(all).not.toMatch(/LEAK|STATUS-REAL|cdn\.test/);

    api.coachInvitation.mockResolvedValue({ clubName: "Club Name", status: "STATUS-REAL", inviterName: "LEAK-inviter" });
    n = await renderNative(createElement(CoachInviteScreen, { token: "tok" }));
    await n.flush();
    all = texts(n).join(" ");
    expect(all).toContain("Club Name");
    expect(all).not.toMatch(/LEAK|STATUS-REAL|cdn\.test/);

    api.playerInvitation.mockResolvedValue({ playerName: "Ana", status: "STATUS-REAL", coachName: "LEAK-coach", clubName: "LEAK-club" });
    n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    all = texts(n).join(" ");
    expect(all).toContain("Ana");
    expect(all).not.toMatch(/LEAK|STATUS-REAL|cdn\.test/);
  });

  it("[AUTH-INVITE-WELCOME-5] every screen scrolls and the player page's sign-in link sits in the flow under the form", async () => {
    let n = await renderNative(createElement(JoinCoachScreen, { token: "tok" }));
    await n.flush();
    expect(n.root.root.findAll((x) => (x.type as unknown) === "ScrollView").length).toBeGreaterThan(0);

    n = await renderNative(createElement(PlayerInviteScreen, { token: "tok" }));
    await n.flush();
    const scroll = n.root.root.findAll((x) => (x.type as unknown) === "ScrollView")[0];
    expect(scroll).toBeTruthy();
    // The link is inside the scrolled content (under the card), not pinned over it.
    expect(inside(scroll, "invite-claim-signin")).toBe(true);
    const link = n.byTestId("invite-claim-signin");
    let el: ReactTestInstance | null = link;
    while (el) {
      expect(String(el.props?.className ?? "")).not.toMatch(/(^|\s)absolute(\s|$)/);
      el = el.parent;
    }
  });
});
