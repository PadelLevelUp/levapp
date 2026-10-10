import { beforeEach, describe, expect, it, vi } from "vitest";
import { MENU_PAGES, prefetchAppPages, resetPrefetchedPagesForTest, type PageName } from "./lazyPages";

/** client.route-loading rule 3 (PAD-585): "The menu's pages are prefetched once". */
describe("prefetchAppPages", () => {
  beforeEach(() => resetPrefetchedPagesForTest());

  it("loads each menu page exactly once and no public page", async () => {
    const load = vi.fn((_name: PageName) => Promise.resolve({}));
    prefetchAppPages(load);
    prefetchAppPages(load);
    await Promise.resolve();

    const loaded = load.mock.calls.map(([name]) => name);
    expect(loaded).toHaveLength(MENU_PAGES.length);
    expect(new Set(loaded)).toEqual(new Set(MENU_PAGES));
    expect(loaded).toContain("CalendarPage");
    for (const publicPage of ["LandingPage", "AuthPage", "PrivacyPolicyPage", "PlayerInvitePage"] as const) {
      expect(loaded).not.toContain(publicPage);
    }
  });

  it("retries a page whose prefetch failed on the next call", async () => {
    const load = vi.fn((name: PageName) => (name === "CalendarPage" ? Promise.reject(new Error("offline")) : Promise.resolve({})));
    prefetchAppPages(load);
    await new Promise((r) => setTimeout(r, 0));
    load.mockClear();
    prefetchAppPages(load);
    expect(load.mock.calls.map(([name]) => name)).toEqual(["CalendarPage"]);
  });
});
