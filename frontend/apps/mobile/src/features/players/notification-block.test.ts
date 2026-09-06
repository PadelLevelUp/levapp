import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_BLOCK_LEVEL_KEYS,
  summarizeNotificationBlock,
} from "@/features/players/notification-block";

describe("summarizeNotificationBlock", () => {
  it("reports nothing for a student who blocked nothing", () => {
    expect(summarizeNotificationBlock({ notificationsBlocked: false })).toEqual({
      blocked: false,
      levelKeys: [],
      reason: null,
    });
  });

  it("treats an older payload with the fields absent as not blocked", () => {
    expect(summarizeNotificationBlock({})).toEqual({
      blocked: false,
      levelKeys: [],
      reason: null,
    });
    expect(summarizeNotificationBlock(null)).toEqual({
      blocked: false,
      levelKeys: [],
      reason: null,
    });
  });

  it("gates on the server-derived flag, not on the three booleans", () => {
    // The three flags without the derived one cannot happen against a current
    // backend (rule 10 derives it), and the coach UI must not invent a signal
    // the API did not report — web reads `notificationsBlocked` alone.
    expect(
      summarizeNotificationBlock({
        blockAutoInvitations: true,
        blockManualInvitations: true,
      }).blocked
    ).toBe(false);
  });

  it("lists the blocked levels in web's all → auto → manual order", () => {
    expect(
      summarizeNotificationBlock({
        notificationsBlocked: true,
        blockManualInvitations: true,
        blockAutoInvitations: true,
        blockAllNotifications: true,
      }).levelKeys
    ).toEqual([
      NOTIFICATION_BLOCK_LEVEL_KEYS.all,
      NOTIFICATION_BLOCK_LEVEL_KEYS.auto,
      NOTIFICATION_BLOCK_LEVEL_KEYS.manual,
    ]);
  });

  it("lists only the levels that are actually set", () => {
    expect(
      summarizeNotificationBlock({
        notificationsBlocked: true,
        blockAutoInvitations: true,
      }).levelKeys
    ).toEqual([NOTIFICATION_BLOCK_LEVEL_KEYS.auto]);
  });

  it("keeps the student's stated reason", () => {
    expect(
      summarizeNotificationBlock({
        notificationsBlocked: true,
        blockAutoInvitations: true,
        notificationBlockReason: "Vou estar fora até setembro",
      }).reason
    ).toBe("Vou estar fora até setembro");
  });

  it("reports a blank or whitespace-only reason as none given", () => {
    for (const reason of ["", "   ", undefined]) {
      expect(
        summarizeNotificationBlock({
          notificationsBlocked: true,
          blockAllNotifications: true,
          notificationBlockReason: reason,
        }).reason
      ).toBeNull();
    }
  });
});

/**
 * The mobile i18n static-import trap (PAD-158): a key that exists in only one
 * locale tree renders as its raw path on a device and nothing else complains.
 * These keys are the ones PAD-165 put on the player-detail screen.
 */
describe("player-detail block/register strings", () => {
  const localesDir = path.resolve(__dirname, "../../../../../src/locales");

  function players(lang: "en" | "pt"): Record<string, string> {
    const raw = fs.readFileSync(
      path.join(localesDir, lang, "players.json"),
      "utf-8"
    );
    return JSON.parse(raw).players;
  }

  const keys = [
    ...Object.values(NOTIFICATION_BLOCK_LEVEL_KEYS),
    "players.notificationsBlockedBadge",
    "players.notificationsBlockedTitle",
    "players.notificationsBlockedReason",
    "players.notificationsBlockedNoReason",
    "players.noAccountMessage",
    "players.shareRegisterLink",
    "players.shareLinkAction",
    "players.shareLinkFailed",
  ];

  for (const lang of ["en", "pt"] as const) {
    it(`resolves every one of them in ${lang}`, () => {
      const tree = players(lang);
      for (const key of keys) {
        const leaf = key.replace(/^players\./, "");
        expect(typeof tree[leaf], `${key} missing from ${lang}`).toBe("string");
        expect(tree[leaf].length, `${key} empty in ${lang}`).toBeGreaterThan(0);
      }
    });
  }
});
