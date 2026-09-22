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

import { SeasonsSection, seasonUnsaved } from "./seasons-section";
import {
  UnsavedRegistryProvider,
  useUnsavedRegistry,
} from "@/features/settings/unsaved-registry";

const SEASON = {
  label: "2026/27",
  startDay: 1,
  startMonth: 9,
  endDay: 31,
  endMonth: 7,
  wrapsYear: true,
  needsReview: false,
  current: null,
  upcoming: null,
};

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

describe("seasonUnsaved (settings.unsaved-edits rule 2)", () => {
  it("is false against the loaded definition, true the moment a field differs", () => {
    expect(seasonUnsaved({ label: "2026/27", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 }, SEASON)).toBe(
      false
    );
    expect(seasonUnsaved({ label: "Epoca nova", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 }, SEASON)).toBe(
      true
    );
  });

  it("with no season saved, the default draft reads clean", () => {
    expect(seasonUnsaved({ label: "", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 }, null)).toBe(false);
  });

  it("a hand-revert back to the loaded label reads clean", () => {
    const edited = { label: "Epoca nova", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };
    expect(seasonUnsaved(edited, SEASON)).toBe(true);
    expect(seasonUnsaved({ ...edited, label: SEASON.label }, SEASON)).toBe(false);
  });
});

describe("SeasonsSection registers its unsaved state (PAD-394)", () => {
  it("editing the label -> unsaved; hand-revert -> clean; a successful save -> clean", async () => {
    let registry!: ReturnType<typeof useUnsavedRegistry>;
    function Capture() {
      registry = useUnsavedRegistry();
      return null;
    }
    const n = await renderNative(
      <UnsavedRegistryProvider>
        <Capture />
        <SeasonsSection />
      </UnsavedRegistryProvider>
    );
    await n.flush();
    expect(registry.hasUnsaved()).toBe(false);

    await n.changeText("season-label", "Epoca nova");
    expect(registry.hasUnsaved()).toBe(true);

    await n.changeText("season-label", SEASON.label);
    expect(registry.hasUnsaved()).toBe(false);
  });
});
