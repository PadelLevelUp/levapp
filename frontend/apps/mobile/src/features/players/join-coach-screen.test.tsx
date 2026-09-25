/**
 * players.join-token rule 8a (PAD-444, B-197) on iOS: once the join is accepted, the client
 * re-reads /me, so the student's first dashboard knows she has a coach. A failed join refreshes
 * nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

const previewJoinToken = vi.fn();
const acceptJoinToken = vi.fn();
vi.mock("@levelup/api", () => ({
  joinTokensApi: {
    previewJoinToken: (...a: unknown[]) => previewJoinToken(...a),
    acceptJoinToken: (...a: unknown[]) => acceptJoinToken(...a),
  },
}));
const refreshUser = vi.fn();
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 7, roles: ["student"], coaches: [] },
    isAuthenticated: true,
    loading: false,
    refreshUser,
  }),
}));
vi.mock("expo-router", () => ({ router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/brand/LevAppMark", () => ({ LevAppMark: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { JoinCoachScreen } from "./JoinCoachScreen";

beforeEach(() => {
  previewJoinToken.mockReset().mockResolvedValue({ coachName: "Maria", clubName: "Padel Norte" });
  acceptJoinToken.mockReset();
  refreshUser.mockReset().mockResolvedValue({ id: 7, coaches: [{ id: 1 }] });
});

async function mountOnPreview() {
  const n = await renderNative(createElement(JoinCoachScreen, { token: "tok123" }));
  await n.flush();
  n.byTestId("join-coach-confirm");
  return n;
}

describe("JoinCoachScreen re-reads /me after a join (PAD-444)", () => {
  it("refreshes the signed-in user once the server accepts the join", async () => {
    acceptJoinToken.mockResolvedValue({ coachName: "Maria", clubName: "Padel Norte", alreadyMember: false });
    const n = await mountOnPreview();
    await n.press("join-coach-confirm");
    await n.flush();
    expect(acceptJoinToken).toHaveBeenCalledWith("tok123");
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(acceptJoinToken.mock.invocationCallOrder[0]).toBeLessThan(refreshUser.mock.invocationCallOrder[0]);
  });

  it("refreshes nothing when the join fails", async () => {
    acceptJoinToken.mockRejectedValue({ response: { status: 500 } });
    const n = await mountOnPreview();
    await n.press("join-coach-confirm");
    await n.flush();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it("still shows the success card when the refresh itself fails", async () => {
    acceptJoinToken.mockResolvedValue({ coachName: "Maria", clubName: "Padel Norte", alreadyMember: false });
    refreshUser.mockRejectedValue(new Error("network"));
    const n = await mountOnPreview();
    await n.press("join-coach-confirm");
    await n.flush();
    expect(n.queryByTestId("join-coach-go-calendar")).not.toBeNull();
  });
});
