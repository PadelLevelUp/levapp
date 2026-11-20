/**
 * players.list rules 5, 15 (PAD-834): the roster's two alerts are its filters, and each row shows
 * the pending and needs-configuring cues. The Players tab (app/, react-query) is outside the unit
 * harness; its use of these sections is pinned by reading the source.
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
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { PlayerRowStates, RosterAlerts } from "./players-list-alerts";

const text = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const row = (over: Partial<CoachPlayer>): CoachPlayer =>
  ({
    id: "cp", coachId: "1", playerId: "1", userId: "10", name: "X", email: "", isActive: true,
    validated: true, levelId: "L1", side: "left", pendingRegistration: false, addedAt: null, ...over,
  }) as CoachPlayer;

const NOW = new Date("2026-11-19T12:00:00Z");

describe("RosterAlerts (PAD-834)", () => {
  it("[PLAYERS-LIST-17] the two alerts filter and exclude each other, and rows carry the pending and no-level chips", async () => {
    const toggled: string[] = [];
    let cleared = 0;
    const el = (filter: "pending" | "incomplete" | null) =>
      createElement(RosterAlerts, {
        incomplete: 6, pending: 4, filter,
        onToggle: (f: string) => toggled.push(f), onClear: () => { cleared += 1; },
      });
    const n = await renderNative(el(null));
    expect(text(n.byTestId("players-alert-incomplete"))).toBe('players.card.alertIncomplete:{"count":6}');
    expect(text(n.byTestId("players-alert-pending"))).toBe('players.card.alertPending:{"count":4}');
    expect(n.queryByTestId("players-filter-clear")).toBeNull();

    await n.press("players-alert-pending");
    await n.press("players-alert-incomplete");
    expect(toggled).toEqual(["pending", "incomplete"]);

    await n.rerender(el("pending"));
    expect(text(n.byTestId("players-filter-active"))).toBe("players.card.pendingFilterActive");
    await n.press("players-filter-clear");
    expect(cleared).toBe(1);

    const chips = await renderNative(createElement(PlayerRowStates, { player: row({ levelId: undefined, side: undefined }), now: NOW }));
    expect(chips.queryByTestId("player-row-no-level")).not.toBeNull();
    expect(chips.queryByTestId("player-row-no-side")).not.toBeNull();
    expect(chips.queryByTestId("pending-registration-badge")).toBeNull();
  });

  it("[PLAYERS-LIST-19] the same on iOS", async () => {
    const pending = await renderNative(createElement(PlayerRowStates, {
      player: row({ pendingRegistration: true, validated: false, isActive: false, addedAt: "2026-11-19T08:00:00+00:00" }),
      now: NOW,
    }));
    expect(text(pending.byTestId("pending-registration-badge"))).toBe("players.card.pendingToday");

    // A Google/Apple student has no password (validated false) and is NOT pending.
    const social = await renderNative(createElement(PlayerRowStates, {
      player: row({ pendingRegistration: false, validated: false }), now: NOW,
    }));
    expect(social.queryByTestId("pending-registration-badge")).toBeNull();

    // The alert tones: amber for por configurar, violet (not amber) for registo pendente.
    const alerts = await renderNative(createElement(RosterAlerts, {
      incomplete: 1, pending: 1, filter: null, onToggle: () => {}, onClear: () => {},
    }));
    expect(String(alerts.byTestId("players-alert-incomplete").props.className)).toContain("border-border");
    expect(String(alerts.byTestId("players-alert-pending").props.className)).toContain("border-violet-300");
    expect(String(alerts.byTestId("players-alert-pending").props.className)).not.toContain("warning");
  });

  it("is what the Players tab renders, with the pending avatar on the row", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const screen = fs.readFileSync(path.resolve(here, "../../../app/(tabs)/players.tsx"), "utf8");
    expect(screen).toContain("<RosterAlerts");
    expect(screen).toContain("<PlayerRowStates");
    expect(screen).toContain('"player-row-avatar-pending"');
    expect(screen).not.toContain("missingLevelAlert");
  });
});
