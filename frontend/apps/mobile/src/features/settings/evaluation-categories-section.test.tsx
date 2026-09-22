/**
 * PAD-393 / PAD-392 (B-155) on iOS: the categories editor is loaded once; a change of
 * language never wipes a category the coach has added and typed but not saved. Names
 * are edited locally until Save, which is what made this section's `[t]` deps a defect.
 * Mounted through src/test/render-native.tsx; the section is handed a NEW `t` after the
 * edit — the mechanism, no timing. (Maestro flow 95 proves the same on the simulator.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderNative } from "@/test/render-native";

const getEvaluationCategories = vi.fn();
vi.mock("@levelup/api", () => ({
  evaluationApi: {
    getEvaluationCategories: (...a: unknown[]) => getEvaluationCategories(...a),
    addEvaluationCategories: vi.fn(),
    deleteEvaluationCategory: vi.fn(),
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

import { EvaluationCategoriesSection } from "./evaluation-categories-section";

const SEEDED = [{ id: 1, name: "Forehand", scaleMin: 1, scaleMax: 10 }];

beforeEach(() => {
  getEvaluationCategories.mockReset().mockResolvedValue(SEEDED);
  settleLanguage();
});

describe("evaluation-categories-section (iOS) — a late load never wipes an unsaved row (PAD-392)", () => {
  it("keeps an added, typed category when the language settles afterwards", async () => {
    const n = await renderNative(<EvaluationCategoriesSection />);
    await n.flush();
    expect(n.queryByTestId("evaluation-category-name-new")).toBeNull();

    await n.press("settings-evaluation-categories-add");
    await n.changeText("evaluation-category-name-new", "Maestro 95");
    expect(n.byTestId("evaluation-category-name-new").props.value).toBe("Maestro 95");

    settleLanguage();
    await n.rerender(<EvaluationCategoriesSection />);
    await n.flush();

    expect(n.byTestId("evaluation-category-name-new").props.value).toBe("Maestro 95");
  });

  it("loads the categories once, however often the language changes", async () => {
    const n = await renderNative(<EvaluationCategoriesSection />);
    await n.flush();
    for (let i = 0; i < 3; i++) {
      settleLanguage();
      await n.rerender(<EvaluationCategoriesSection />);
      await n.flush();
    }
    expect(getEvaluationCategories).toHaveBeenCalledTimes(1);
  });
});
