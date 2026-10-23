/**
 * Signing out ends the session's client-only state (PAD-482). (The save-queue drop of review #497 went
 * with the save-on-change model, PAD-506: nothing in Settings is sent without its Save.)
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { emailPromptSession, legalCatchUpSession } from "@levelup/config";

vi.mock("@/api/auth", () => ({ getMe: vi.fn(() => new Promise(() => undefined)) }));
vi.mock("@/api/client", () => ({ api: { post: vi.fn(async () => undefined) } }));
vi.mock("@/config", () => ({ USE_MOCK_DATA: false }));
vi.mock("@/utils/pushNotifications", () => ({ requestAndSubscribe: vi.fn() }));
vi.mock("@/utils/pushFailureReport", () => ({ startPushFailureReport: () => () => undefined }));
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn(), language: "en" } }));

import { AuthProvider, useAuth } from "./AuthContext";

// PAD-482 (auth.email-verification rule 14, #509 review): "Agora não" lasts for the session; signing out ends it.
describe("logout and the email prompt's dismissal", () => {
  it("the next sign-in asks for a missing email again", () => {
    emailPromptSession.dismiss(7);
    let logout!: () => void;
    function Probe() {
      logout = useAuth().logout;
      return null;
    }
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => logout());
    expect(emailPromptSession.isDismissed(7)).toBe(false);
  });
});

// PAD-637 (auth.legal-catch-up rule 4): "Agora não" on the catch-up lasts the session; signing out ends it.
describe("logout and the catch-up's skip", () => {
  it("the next sign-in shows the catch-up again", () => {
    legalCatchUpSession.skip(7);
    let logout!: () => void;
    function Probe() {
      logout = useAuth().logout;
      return null;
    }
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => logout());
    expect(legalCatchUpSession.isSkipped(7)).toBe(false);
  });
});
