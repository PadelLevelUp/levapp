/**
 * PAD-629 (B-545, settings.language rule 9): a count of zero reads in the plural in Portuguese.
 *
 * i18next resolves plurals with `Intl.PluralRules(<language code>)`. For "pt" that is Brazilian
 * Portuguese, where 0 is "one" — so every `_one`/`_other` pair rendered "0 aula", "0 jogador".
 * The app's Portuguese is European (0 is "other"), so every pt plural pair carries a `_zero`
 * form, which i18next prefers for a count of 0. This guard reads the real locale files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import i18next from "i18next";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PT = path.resolve(HERE, "../../../../src/locales/pt");

type Dict = Record<string, unknown>;
function load(): Dict {
  const merged: Dict = {};
  for (const f of fs.readdirSync(PT).filter((n) => n.endsWith(".json"))) {
    const tree = JSON.parse(fs.readFileSync(path.join(PT, f), "utf8")) as Dict;
    for (const [k, v] of Object.entries(tree)) merged[k] = { ...((merged[k] as Dict) ?? {}), ...(v as Dict) };
  }
  return merged;
}

function pairsWithoutZero(d: Dict, prefix = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === "object") pairsWithoutZero(v as Dict, `${prefix}${k}.`, out);
    else if (k.endsWith("_one")) {
      const base = k.slice(0, -4);
      if (`${base}_other` in d && !(`${base}_zero` in d)) out.push(`${prefix}${base}`);
    }
  }
  return out;
}

describe("Portuguese zero counts (PAD-629)", () => {
  it("every pt plural pair has a _zero form", () => {
    expect(pairsWithoutZero(load())).toEqual([]);
  });

  it("the calendar day header reads '0 aulas', '1 aula', '2 aulas' with the real i18next", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: "pt", resources: { pt: { translation: load() } } });
    expect([0, 1, 2].map((count) => i18n.t("calendar.mobile.classCount", { count }))).toEqual([
      "0 aulas",
      "1 aula",
      "2 aulas",
    ]);
  });
});
