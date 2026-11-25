import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

/** PAD-889 (players.notes rule 3): the strength and weakness fields take at most 500 characters. */
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("./hooks", () => ({
  useAddCoachNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCoachNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { StrengthsWeaknesses } from "./StrengthsWeaknesses";

describe("StrengthsWeaknesses — note length (PAD-889)", () => {
  it("[PLAYERS-NOTES-5] caps both note fields at 500 characters", async () => {
    const n = await renderNative(createElement(StrengthsWeaknesses, { playerId: "7", strengths: [], weaknesses: [] }));
    expect(n.byTestId("sw-add-strength-input").props.maxLength).toBe(500);
    expect(n.byTestId("sw-add-weakness-input").props.maxLength).toBe(500);
  });
});
