/**
 * PAD-482 (auth.email-verification rule 14) — the iOS twin of web's EmailPromptBanner tests, same test
 * ids: a coach with no email is asked for one on the coach home; never a hold; dismissed per session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { emailPromptSession } from "@levelup/config";
import { renderNative } from "@/test/render-native";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: nav.push } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { EmailPromptBanner } from "./email-prompt-banner";

const coach = (email: string | null) => ({ id: 7, roles: ["coach"], email });

beforeEach(() => nav.push.mockReset());
afterEach(() => emailPromptSession.reset());

describe("EmailPromptBanner on iOS (rule 14, PAD-482)", () => {
  it("asks a coach with no email", async () => {
    const n = await renderNative(createElement(EmailPromptBanner, { user: coach(null) }));
    expect(n.queryByTestId("email-prompt")).not.toBeNull();
  });

  it("never shows for a coach with an email, or for a player", async () => {
    const withEmail = await renderNative(createElement(EmailPromptBanner, { user: coach("rui@example.com") }));
    expect(withEmail.queryByTestId("email-prompt")).toBeNull();
    const player = await renderNative(createElement(EmailPromptBanner, { user: { id: 8, roles: ["player"], email: null } }));
    expect(player.queryByTestId("email-prompt")).toBeNull();
  });

  it("Adicionar email opens Settings → Perfil on the email field", async () => {
    const n = await renderNative(createElement(EmailPromptBanner, { user: coach(null) }));
    await n.press("email-prompt-add");
    expect(nav.push).toHaveBeenCalledWith({ pathname: "/settings", params: { section: "profile", focus: "email" } });
  });

  it("Agora não hides it for the session; a sign-out brings it back", async () => {
    const n = await renderNative(createElement(EmailPromptBanner, { user: coach(null) }));
    await n.press("email-prompt-dismiss");
    expect(n.queryByTestId("email-prompt")).toBeNull();

    const again = await renderNative(createElement(EmailPromptBanner, { user: coach(null) }));
    expect(again.queryByTestId("email-prompt")).toBeNull();

    emailPromptSession.reset(); // what signOut does
    const next = await renderNative(createElement(EmailPromptBanner, { user: coach(null) }));
    expect(next.queryByTestId("email-prompt")).not.toBeNull();
  });
});
