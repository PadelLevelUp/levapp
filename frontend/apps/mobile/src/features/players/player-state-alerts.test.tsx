/**
 * players.profile rules 9, 11 (PAD-834): the needs-configuring and pending-registration alerts on
 * iOS. Pending is `pendingRegistration`, never `!isActive` or `!validated`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import type { CoachPlayer } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k) }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { PlayerStateAlerts } from "./player-state-alerts";
import { PlayerInfoBlock } from "./player-info-block";

const text = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const base = {
  id: "cp", coachId: "1", playerId: "1", userId: "10", name: "X", email: "x@example.pt", isActive: true,
  validated: true, levelId: "L1", side: "left", pendingRegistration: false, addedAt: null,
} as unknown as CoachPlayer;
const player = (over: Partial<CoachPlayer>) => ({ ...base, ...over }) as CoachPlayer;
const LINK = "https://levapp.app/register/10?t=tok";
const NOW = new Date("2026-11-19T12:00:00Z");

describe("PlayerStateAlerts on iOS (PAD-834)", () => {
  it("[PLAYERS-PROFILE-13] the same on iOS, and the complete button opens the edit mode", async () => {
    const cases: Array<[Partial<CoachPlayer>, string]> = [
      [{ levelId: undefined }, "players.card.missingLevel"],
      [{ side: undefined }, "players.card.missingSide"],
      [{ levelId: undefined, side: undefined }, "players.card.missingBoth"],
    ];
    for (const [over, key] of cases) {
      const onComplete = vi.fn();
      const n = await renderNative(createElement(PlayerStateAlerts, { player: player(over), inviteLink: LINK, onComplete }));
      expect(text(n.byTestId("player-needs-config-missing"))).toBe(key);
      await n.press("player-needs-config-complete");
      expect(onComplete).toHaveBeenCalledTimes(1);
    }
    const busy = await renderNative(createElement(PlayerStateAlerts, {
      player: player({ side: undefined }), inviteLink: LINK, onComplete: () => {}, completeDisabled: true,
    }));
    expect(busy.byTestId("player-needs-config-complete").props.disabled).toBe(true);
    const none = await renderNative(createElement(PlayerStateAlerts, { player: base, inviteLink: LINK, onComplete: () => {} }));
    expect(none.queryByTestId("player-needs-config-alert")).toBeNull();
  });

  it("[PLAYERS-PROFILE-14] copies the activation link with expo-clipboard and offers no share control", async () => {
    const copyText = vi.fn(async () => {});
    const pending = player({ pendingRegistration: true, isActive: false, validated: false, addedAt: "2026-11-19T08:00:00+00:00" });
    const n = await renderNative(createElement(PlayerStateAlerts, {
      player: pending, inviteLink: LINK, onComplete: () => {}, copyText, now: NOW,
    }));
    expect(text(n.byTestId("player-pending-age"))).toBe("players.card.addedToday");
    await n.press("player-copy-invite-link");
    await n.flush();
    expect(copyText).toHaveBeenCalledWith(LINK);
    expect(toast.success).toHaveBeenCalledWith("players.card.linkCopied");
    expect(n.queryByTestId("player-share-register-link")).toBeNull();

    // The default copy goes through expo-clipboard; the screen passes the activation link and no share.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const own = fs.readFileSync(path.resolve(here, "player-state-alerts.tsx"), "utf8");
    expect(own).toContain('require("expo-clipboard")');
    const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
    expect(screen).toContain("inviteLink={registerUrl}");
    expect(screen).not.toContain("Share.share");
    expect(screen).not.toContain("player-share-register-link");
  });

  it("[PLAYERS-PROFILE-15] the same on iOS", async () => {
    const google = player({ isActive: true, validated: false, pendingRegistration: false });
    const halfRegistered = player({ isActive: false, validated: true, pendingRegistration: false });
    const placeholder = player({ isActive: false, validated: false, pendingRegistration: true, email: "" });
    for (const p of [google, halfRegistered]) {
      const n = await renderNative(createElement(PlayerStateAlerts, { player: p, inviteLink: LINK, onComplete: () => {} }));
      expect(n.queryByTestId("player-pending-alert")).toBeNull();
      const edit = await renderNative(createElement(PlayerInfoBlock, {
        player: p, levels: [], session: "edit", onEdit: () => {}, onCancel: () => {}, onSave: async () => {},
      }));
      expect(edit.queryByTestId("player-info-email-input")).toBeNull();
    }
    const n = await renderNative(createElement(PlayerStateAlerts, { player: placeholder, inviteLink: LINK, onComplete: () => {} }));
    expect(n.queryByTestId("player-pending-alert")).not.toBeNull();
    const edit = await renderNative(createElement(PlayerInfoBlock, {
      player: placeholder, levels: [], session: "edit", onEdit: () => {}, onCancel: () => {}, onSave: async () => {},
    }));
    expect(edit.queryByTestId("player-info-email-input")).not.toBeNull();
    const read = await renderNative(createElement(PlayerInfoBlock, {
      player: placeholder, levels: [], session: null, onEdit: () => {}, onCancel: () => {}, onSave: async () => {},
    }));
    expect(text(read.byTestId("player-info-email"))).toBe("players.card.emailAtRegistration");

    // The header chip follows pendingRegistration too.
    const here = path.dirname(fileURLToPath(import.meta.url));
    const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
    expect(screen).toMatch(/player\.pendingRegistration === true \? \(\s*<Badge[^>]*testID="player-chip-pending"/);
    expect(screen).not.toMatch(/!player\.isActive \?/);
  });
});
