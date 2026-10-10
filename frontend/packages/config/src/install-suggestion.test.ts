/**
 * PAD-573 — mobile.install-suggestion rules 1–3 and 8: the pure half of the "get the iOS app"
 * card. The web banner only wires these to the DOM.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APP_STORE_ID,
  APP_STORE_URL,
  INSTALL_SUGGESTION_DISMISS_DAYS,
  INSTALL_SUGGESTION_STORAGE_KEY,
  installSuggestionDismissal,
  isIphoneClassUserAgent,
  suggestsIosApp,
} from "./install-suggestion";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.5993.69 Mobile/15E148 Safari/604.1";
const IPAD_OS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";

describe("the store link (rule 2)", () => {
  it("names the App Store Connect id and the listing URL built from it", () => {
    expect(APP_STORE_ID).toBe("6794271800");
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/id6794271800");
  });

  it("the Smart App Banner meta tag in index.html carries the same id (rule 5, R-029)", () => {
    const html = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/index.html"),
      "utf8"
    );
    expect(html).toContain(`<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}" />`);
  });
});

describe("iPhone-class user agents (rule 1)", () => {
  it.each([
    ["Safari on iPhone", IPHONE, true],
    ["Chrome on iPhone", IPHONE_CHROME, true],
    ["an iPod touch", "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) Safari/604.1", true],
    ["iPadOS (presents as a Mac)", IPAD_OS, false],
    ["Android", ANDROID, false],
    ["desktop", DESKTOP, false],
    ["no user agent", null, false],
  ])("%s", (_name, ua, expected) => {
    expect(isIphoneClassUserAgent(ua)).toBe(expected);
  });
});

describe("the audience (rule 1)", () => {
  it("a student on an iPhone", () => {
    expect(suggestsIosApp({ roles: ["player"] }, IPHONE)).toBe(true);
  });
  it("a coach on an iPhone never", () => {
    expect(suggestsIosApp({ roles: ["coach"] }, IPHONE)).toBe(false);
    expect(suggestsIosApp({ roles: ["coach", "player"] }, IPHONE)).toBe(false);
  });
  it("a student on Android or desktop never", () => {
    expect(suggestsIosApp({ roles: ["player"] }, ANDROID)).toBe(false);
    expect(suggestsIosApp({ roles: ["player"] }, DESKTOP)).toBe(false);
  });
  it("nobody signed in, nothing", () => {
    expect(suggestsIosApp(null, IPHONE)).toBe(false);
    expect(suggestsIosApp(undefined, IPHONE)).toBe(false);
  });
  it("a signed-in user with no roles field is treated as a student (rule 1)", () => {
    expect(suggestsIosApp({}, IPHONE)).toBe(true);
    expect(suggestsIosApp({ roles: null }, IPHONE)).toBe(true);
  });
});

describe("the 30-day dismissal on the device (rule 3)", () => {
  const DAY = 24 * 60 * 60 * 1000;
  function memoryStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    };
  }

  it("is 30 days under the documented key", () => {
    expect(INSTALL_SUGGESTION_DISMISS_DAYS).toBe(30);
    expect(INSTALL_SUGGESTION_STORAGE_KEY).toBe("levapp.installSuggestion.dismissedAt");
  });

  it("not dismissed until dismissed; then hidden for 30 days, back on the 31st", () => {
    const storage = memoryStorage();
    const d = installSuggestionDismissal(storage);
    const t0 = Date.UTC(2026, 9, 9, 12, 0, 0);
    expect(d.isDismissed(t0)).toBe(false);
    d.dismiss(t0);
    expect(storage.map.get(INSTALL_SUGGESTION_STORAGE_KEY)).toBe(String(t0));
    expect(d.isDismissed(t0 + 29 * DAY)).toBe(true);
    expect(d.isDismissed(t0 + 30 * DAY - 1)).toBe(true);
    expect(d.isDismissed(t0 + 31 * DAY)).toBe(false);
  });

  it("a malformed, empty or future value counts as not dismissed", () => {
    const now = Date.UTC(2026, 9, 9);
    expect(installSuggestionDismissal(memoryStorage({ [INSTALL_SUGGESTION_STORAGE_KEY]: "soon" })).isDismissed(now)).toBe(false);
    expect(installSuggestionDismissal(memoryStorage({ [INSTALL_SUGGESTION_STORAGE_KEY]: "" })).isDismissed(now)).toBe(false);
    expect(installSuggestionDismissal(memoryStorage({ [INSTALL_SUGGESTION_STORAGE_KEY]: "  " })).isDismissed(now)).toBe(false);
    expect(installSuggestionDismissal(memoryStorage({ [INSTALL_SUGGESTION_STORAGE_KEY]: String(now + DAY) })).isDismissed(now)).toBe(false);
  });

  it("storage that throws (private mode) never breaks the page: not dismissed, and the dismissal lasts the page only", () => {
    const throwing = {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    };
    const d = installSuggestionDismissal(throwing);
    const now = Date.UTC(2026, 9, 9);
    expect(d.isDismissed(now)).toBe(false);
    expect(() => d.dismiss(now)).not.toThrow();
    expect(d.isDismissed(now + 1)).toBe(true);
  });

  it("no storage at all behaves the same", () => {
    const d = installSuggestionDismissal(null);
    expect(d.isDismissed()).toBe(false);
    d.dismiss();
    expect(d.isDismissed()).toBe(true);
  });
});
