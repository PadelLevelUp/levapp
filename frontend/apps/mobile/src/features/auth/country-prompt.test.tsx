/**
 * PAD-630 — auth.login rule 13, the iOS prompt: shown to a signed-in user whose country is null,
 * never to one with a country, a held one, or one who said "Agora não" in the last 30 days.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { COUNTRY_PROMPT_STORAGE_KEY } from "@levelup/config";
import { renderNative } from "@/test/render-native";

type TestUser = { id: number; roles: string[]; country?: string | null; emailVerification?: string; coachApproval?: string; clubs?: unknown[] };
const auth = vi.hoisted(() => ({ user: null as null | TestUser, refreshUser: vi.fn(async () => null) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: auth.user, refreshUser: auth.refreshUser }) }));

const updateMe = vi.hoisted(() => vi.fn());
vi.mock("@levelup/api", () => ({ authApi: { updateMe } }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/dialog", async () => {
  const { View, Text } = await import("react-native");
  const pass = (props: Record<string, unknown>) => createElement(View, props);
  return {
    Dialog: ({ open, children }: { open: boolean; children: unknown }) => (open ? (children as never) : null),
    DialogContent: pass,
    DialogHeader: pass,
    DialogFooter: pass,
    DialogTitle: (p: Record<string, unknown>) => createElement(Text, p),
    DialogDescription: (p: Record<string, unknown>) => createElement(Text, p),
  };
});
vi.mock("@/components/ui/button", async () => {
  const { Pressable } = await import("react-native");
  return { Button: (p: Record<string, unknown>) => createElement(Pressable, p) };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: (p: Record<string, unknown>) => createElement(Text, p) };
});

// The device's key-value store (SecureStore on iOS), as a plain map.
const device = vi.hoisted(() => ({ map: new Map<string, string>() }));
vi.mock("@/lib/country-prompt-storage", () => ({
  loadCountryPromptStorage: async () => ({
    getItem: (k: string) => device.map.get(k) ?? null,
    setItem: (k: string, v: string) => void device.map.set(k, v),
  }),
}));

import { CountryPrompt } from "./country-prompt";

beforeEach(() => {
  device.map.clear();
  auth.user = { id: 7, roles: ["player"], country: null };
  auth.refreshUser.mockClear();
  updateMe.mockReset().mockResolvedValue({ id: 7, country: "PT" });
});

async function mount() {
  const n = await renderNative(createElement(CountryPrompt));
  await n.flush();
  return n;
}

describe("the country prompt (iOS)", () => {
  it("shows for a null country, with PT selected", async () => {
    const n = await mount();
    expect(n.queryByTestId("country-prompt")).not.toBeNull();
    expect(n.byTestId("country-prompt-option-PT").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("not for a set country, nobody, a held user or a dismissed device", async () => {
    auth.user = { id: 7, roles: ["player"], country: "ES" };
    expect((await mount()).queryByTestId("country-prompt")).toBeNull();
    auth.user = null;
    expect((await mount()).queryByTestId("country-prompt")).toBeNull();
    auth.user = { id: 7, roles: ["player"], country: null, emailVerification: "pending" };
    expect((await mount()).queryByTestId("country-prompt")).toBeNull();
    auth.user = { id: 7, roles: ["coach"], country: null, coachApproval: "pending", clubs: [] };
    expect((await mount()).queryByTestId("country-prompt")).toBeNull();
    auth.user = { id: 7, roles: ["player"], country: null };
    device.map.set(COUNTRY_PROMPT_STORAGE_KEY, String(Date.now() - 1000));
    expect((await mount()).queryByTestId("country-prompt")).toBeNull();
  });

  it("Guardar sends the chosen country and refreshes the signed-in user", async () => {
    const n = await mount();
    await n.press("country-prompt-option-BR");
    await n.press("country-prompt-save");
    await n.flush();
    expect(updateMe).toHaveBeenCalledWith({ country: "BR" });
    expect(auth.refreshUser).toHaveBeenCalledTimes(1);
  });

  it("Agora não hides it and remembers it on the device", async () => {
    const n = await mount();
    await n.press("country-prompt-later");
    expect(n.queryByTestId("country-prompt")).toBeNull();
    expect(Date.now() - Number(device.map.get(COUNTRY_PROMPT_STORAGE_KEY))).toBeLessThan(5000);
    expect(updateMe).not.toHaveBeenCalled();
  });

  it("a failed save shows an inline error and keeps the prompt", async () => {
    updateMe.mockRejectedValue(new Error("400"));
    const n = await mount();
    await n.press("country-prompt-save");
    await n.flush();
    expect(n.queryByTestId("country-prompt-error")).not.toBeNull();
    expect(n.queryByTestId("country-prompt")).not.toBeNull();
    expect(auth.refreshUser).not.toHaveBeenCalled();
  });
});
