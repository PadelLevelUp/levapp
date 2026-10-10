/**
 * PAD-573 — mobile.install-suggestion rules 1, 3, 4: the card's DOM side. The audience and
 * window logic are unit-tested in @levelup/config; this proves the banner wires them to the
 * signed-in user, the browser's user agent and localStorage, and that "Agora não" sticks.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { INSTALL_SUGGESTION_STORAGE_KEY } from "@levelup/config";

const auth = vi.hoisted(() => ({ user: null as null | { id: number; roles: string[] } }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));

import { InstallAppBanner } from "./InstallAppBanner";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/118.0.0.0 Safari/537.36";

function withUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  auth.user = { id: 7, roles: ["player"] };
  withUserAgent(IPHONE);
});
afterEach(() => localStorage.clear());

describe("the install-app banner", () => {
  it("a student on an iPhone sees it, with the App Store link", () => {
    render(<InstallAppBanner />);
    const banner = screen.getByTestId("install-app-banner");
    expect(banner).toBeTruthy();
    expect(screen.getByTestId("install-app-open").getAttribute("href")).toBe("https://apps.apple.com/app/id6794271800");
    expect(banner).toHaveTextContent(/App Store/);
  });

  it("a coach never, a desktop never, nobody signed in never", () => {
    auth.user = { id: 1, roles: ["coach"] };
    const { unmount } = render(<InstallAppBanner />);
    expect(screen.queryByTestId("install-app-banner")).toBeNull();
    unmount();

    auth.user = { id: 7, roles: ["player"] };
    withUserAgent(DESKTOP);
    const second = render(<InstallAppBanner />);
    expect(screen.queryByTestId("install-app-banner")).toBeNull();
    second.unmount();

    withUserAgent(IPHONE);
    auth.user = null;
    render(<InstallAppBanner />);
    expect(screen.queryByTestId("install-app-banner")).toBeNull();
  });

  it("'Agora não' removes it and stores the instant; a fresh mount stays hidden", () => {
    const { unmount } = render(<InstallAppBanner />);
    fireEvent.click(screen.getByTestId("install-app-dismiss"));
    expect(screen.queryByTestId("install-app-banner")).toBeNull();
    const stored = Number(localStorage.getItem(INSTALL_SUGGESTION_STORAGE_KEY));
    expect(Math.abs(Date.now() - stored)).toBeLessThan(5000);
    unmount();

    render(<InstallAppBanner />);
    expect(screen.queryByTestId("install-app-banner")).toBeNull();
  });

  it("a dismissal older than 30 days no longer hides it", () => {
    localStorage.setItem(INSTALL_SUGGESTION_STORAGE_KEY, String(Date.now() - 31 * 24 * 60 * 60 * 1000));
    render(<InstallAppBanner />);
    expect(screen.getByTestId("install-app-banner")).toBeTruthy();
  });
});
