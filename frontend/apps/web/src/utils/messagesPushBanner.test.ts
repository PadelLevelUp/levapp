/**
 * PAD-789 — auth.push-subscription rule 10: the web Messages page's push line is one pure decision
 * of the browser's state, and the page renders only the line it names. The page itself is checked
 * statically, as the other `MessagesPage` tests are (the unit harness does not mount it).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { messagesPushBanner, type MessagesPushBannerInput } from "./messagesPushBanner";

const base: MessagesPushBannerInput = { ready: true, isSupported: true, permission: "default", isSubscribed: false, saveState: "idle" };

describe("messagesPushBanner (rule 10, PAD-789)", () => {
  it("[AUTH-PUSH-SUBSCRIPTION-9] each browser state gives one line, and none without a Push API or before the subscription is read", () => {
    const cases: [string, Partial<MessagesPushBannerInput>, ReturnType<typeof messagesPushBanner>][] = [
      ["no Push API", { isSupported: false, permission: "unsupported" }, "none"],
      ["subscription not read yet", { ready: false, permission: "granted" }, "none"],
      ["default, not subscribed", {}, "enable"],
      ["granted, not subscribed, idle", { permission: "granted" }, "enable"],
      ["granted and subscribed", { permission: "granted", isSubscribed: true, saveState: "saved" }, "none"],
      ["granted, not subscribed, save failed", { permission: "granted", saveState: "failed" }, "inactive"],
      ["granted, subscribed, save failed", { permission: "granted", isSubscribed: true, saveState: "failed" }, "inactive"],
      ["denied", { permission: "denied" }, "blocked"],
    ];
    for (const [name, change, expected] of cases) {
      expect(messagesPushBanner({ ...base, ...change }), name).toBe(expected);
    }
  });

  it("[AUTH-PUSH-SUBSCRIPTION-9] the Messages page takes its line from the decision and renders each line only for its result", () => {
    const page = readFileSync(join(__dirname, "..", "pages", "MessagesPage.tsx"), "utf8");
    expect(page).toMatch(/const pushBanner = messagesPushBanner\(\{/);
    for (const [result, testId] of [
      ["inactive", "push-inactive-banner"],
      ["enable", "push-enable-banner"],
      ["blocked", "push-blocked-banner"],
    ]) {
      const at = page.indexOf(`data-testid="${testId}"`);
      expect(at, testId).toBeGreaterThan(-1);
      // The nearest condition before the line is its own result, nothing else.
      const guard = page.slice(page.lastIndexOf("{pushBanner ===", at), at);
      expect(guard, testId).toMatch(new RegExp(`^\\{pushBanner === "${result}" && \\(`));
    }
    // No line is still gated by the old inline conditions.
    expect(page).not.toMatch(/isSupported && permission === "denied" &&/);
    expect(page).not.toMatch(/isSupported && !isSubscribed && permission !== "denied"/);
  });
});
