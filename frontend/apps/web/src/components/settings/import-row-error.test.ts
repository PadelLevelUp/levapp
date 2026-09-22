import { describe, expect, it } from "vitest";
import i18next from "i18next";
import en from "../../../../../src/locales/en/settings.json";
import pt from "../../../../../src/locales/pt/settings.json";
import { importRowErrorText } from "./import-row-error";

async function tFor(lng: "en" | "pt") {
  const i18n = i18next.createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, pt: { translation: pt } }, interpolation: { escapeValue: false } });
  return i18n.t;
}

const OUT_OF_RANGE = {
  row: 0,
  code: "score_out_of_range",
  category: "Forehand",
  value: 8,
  error: "Score 8 for 'Forehand' is outside 1-5: scores are 1-5 stars, rescale the sheet",
};

describe("importRowErrorText (D111)", () => {
  it("renders a score off 1-5 in the coach's language, naming the category, the value and what to do", async () => {
    const enText = importRowErrorText(await tFor("en"), OUT_OF_RANGE);
    const ptText = importRowErrorText(await tFor("pt"), OUT_OF_RANGE);
    for (const text of [enText, ptText]) {
      expect(text).toContain("Forehand");
      expect(text).toContain("8");
      expect(text).toContain("1–5");
      expect(text).not.toContain("settings.import");
    }
    expect(enText).not.toEqual(ptText);
  });

  it("falls back to the server's text for a code this build does not know", async () => {
    const t = await tFor("pt");
    expect(importRowErrorText(t, { row: 1, code: "some_future_code", error: "Server text" })).toBe("Server text");
  });

  it("shows an uncoded error as sent", async () => {
    const t = await tFor("en");
    expect(importRowErrorText(t, { row: 2, error: "Player not found: 'X'" })).toBe("Player not found: 'X'");
  });
});
