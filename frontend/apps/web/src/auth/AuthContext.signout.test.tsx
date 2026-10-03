/**
 * Review #497 (settings.save-on-change): signing out drops every setting still waiting to be saved, so it
 * can never be sent with the next account's session.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createSerialSaver, emailPromptSession, SaveSuperseded } from "@levelup/config";

vi.mock("@/api/auth", () => ({ getMe: vi.fn(() => new Promise(() => undefined)) }));
vi.mock("@/api/client", () => ({ api: { post: vi.fn(async () => undefined) } }));
vi.mock("@/config", () => ({ USE_MOCK_DATA: false }));
vi.mock("@/utils/pushNotifications", () => ({ requestAndSubscribe: vi.fn() }));
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn(), language: "en" } }));

import { AuthProvider, useAuth } from "./AuthContext";

describe("logout and settings still waiting to be saved", () => {
  it("a value waiting in a save queue is dropped, never sent under the next session", async () => {
    const sent: string[] = [];
    let release!: () => void;
    const save = createSerialSaver<string, void>((v) => new Promise<void>((res) => { sent.push(v); release = res; }));
    void save("out");
    const waiting = save("waiting");
    waiting.catch(() => undefined);

    let logout!: () => void;
    function Probe() {
      logout = useAuth().logout;
      return null;
    }
    render(<AuthProvider><Probe /></AuthProvider>);
    act(() => logout());
    release();

    await expect(waiting).rejects.toBeInstanceOf(SaveSuperseded);
    expect(sent).toEqual(["out"]);
  });
});

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

