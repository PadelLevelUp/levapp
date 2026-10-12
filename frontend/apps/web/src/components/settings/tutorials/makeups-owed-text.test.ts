import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { describePriority, resolveText } from "@levelup/config";
import en from "../../../../../../src/locales/en/tutorials.json";
import pt from "../../../../../../src/locales/pt/tutorials.json";

/** PAD-505: the make-up tiebreaker reads as a count in both languages, through the real plural
 * forms — a missing `_zero`/`_one`/`_other` form would show the raw key instead. Web and iOS load
 * these same files. */
async function tFor(lng: "en" | "pt") {
  const i18n = i18next.createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, pt: { translation: pt } }, interpolation: { escapeValue: false } });
  return i18n.t.bind(i18n) as (key: string, params?: Record<string, unknown>) => string;
}

type T = Awaited<ReturnType<typeof tFor>>;
const owed = (t: T) => (n: number) => resolveText(t, describePriority({ id: "justified_misses", owed: n, rate: 0 }));

describe("PAD-505: classes owed, in words", () => {
  it("pt", async () => {
    expect([0, 1, 2].map(owed(await tFor("pt")))).toEqual(["nenhuma aula por repor", "1 aula por repor", "2 aulas por repor"]);
  });

  it("en", async () => {
    expect([0, 1, 2].map(owed(await tFor("en")))).toEqual(["no classes to make up", "1 class to make up", "2 classes to make up"]);
  });

  it("an answer from a server before PAD-505 keeps the percentage", async () => {
    expect(resolveText(await tFor("pt"), describePriority({ id: "justified_misses", rate: 0.333 }))).toBe("faltas justificadas 33%");
  });
});
