/**
 * PAD-393 / PAD-392 (B-155) on iOS: the season form is loaded once; a change of language
 * never replaces what has been typed into it. The port of the web SeasonsSection test to
 * the mobile section through src/test/render-native.tsx: the mounted section is handed a
 * NEW `t` after an edit — the defect's mechanism, no timing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

const getSeason = vi.fn();
vi.mock("@levelup/api", () => ({
  seasonsApi: {
    getSeason: (...a: unknown[]) => getSeason(...a),
    saveSeason: vi.fn(),
    deleteSeason: vi.fn(),
  },
}));

let currentT = (key: string) => key;
const settleLanguage = () => {
  currentT = (key: string) => key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT, i18n: { language: "en" } }),
}));

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});

import { SeasonsSection } from "./seasons-section";

const SEASON = { label: "2026/27", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };

beforeEach(() => {
  getSeason.mockReset().mockResolvedValue(SEASON);
  settleLanguage();
});

describe("seasons-section (iOS) — a late load never replaces the form (PAD-392)", () => {
  it("keeps what was typed when the language settles afterwards", async () => {
    const n = await renderNative(<SeasonsSection />);
    await n.flush();
    expect(n.byTestId("season-label").props.value).toBe("2026/27");

    await n.changeText("season-label", "Epoca nova");
    expect(n.byTestId("season-label").props.value).toBe("Epoca nova");

    settleLanguage();
    await n.rerender(<SeasonsSection />);
    await n.flush();

    expect(n.byTestId("season-label").props.value).toBe("Epoca nova");
  });

  it("loads the season once, however often the language changes", async () => {
    const n = await renderNative(<SeasonsSection />);
    await n.flush();
    for (let i = 0; i < 3; i++) {
      settleLanguage();
      await n.rerender(<SeasonsSection />);
      await n.flush();
    }
    expect(getSeason).toHaveBeenCalledTimes(1);
  });
});
