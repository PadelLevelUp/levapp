/**
 * auth.register rule 2a (PAD-799) on iOS and Android: the username a person chooses on the invite
 * and activation screens (CoachInviteScreen, PlayerInviteScreen, RegisterScreen — all one
 * AccountSetupForm) is lowercase as it is typed. The twin of web's CoachInvitePage /
 * PlayerInvitePage / RegisterPage cases.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import type { ReactNode } from "react";
import { renderNative } from "@/test/render-native";

vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/brand/LevAppMark", () => ({ LevAppMark: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));
vi.mock("@/features/auth/CountryField", () => ({ CountryField: () => null }));
vi.mock("@/features/auth/TermsAcceptField", () => ({ TermsAcceptField: () => null }));
vi.mock("react-native", async (orig) => {
  const rn = await orig<Record<string, unknown>>();
  return { ...rn, Keyboard: { dismiss: () => {} }, KeyboardAvoidingView: rn.View };
});

import { AccountSetupForm } from "./AccountSetupScreen";

function Form(): ReactNode {
  const [values, setValues] = useState<Record<string, string>>({ name: "", username: "" });
  return createElement(AccountSetupForm, {
    title: "t", description: "d", testID: "setup", submitLabel: "go", submitting: false, submitError: null,
    fields: [
      { id: "name", label: "name", autoComplete: "name" },
      { id: "username", label: "username", autoComplete: "username-new" },
    ],
    values, errors: {}, onSubmit: () => {},
    onChangeField: (id: string, next: string) => setValues((v) => ({ ...v, [id]: next })),
  });
}

describe("AccountSetupForm — a chosen username is lowercase (PAD-799, auth.register rule 2a)", () => {
  it("capitals typed in the username become lowercase as they are typed; other fields keep their case", async () => {
    const n = await renderNative(createElement(Form));
    await n.changeText("setup-username", "New.Name");
    await n.changeText("setup-name", "New Name");
    expect(n.byTestId("setup-username").props.value).toBe("new.name");
    expect(n.byTestId("setup-name").props.value).toBe("New Name");
  });
});
