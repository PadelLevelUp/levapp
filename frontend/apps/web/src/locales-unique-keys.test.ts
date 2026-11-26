import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LOCALES = join(__dirname, "../../../src/locales");

/** Dotted paths of keys that appear twice in one object; JSON.parse keeps the last and hides the first. */
function duplicateKeys(text: string): string[] {
  const dupes: string[] = [];
  let i = 0;
  const skipWs = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const readString = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const readValue = (path: string) => {
    skipWs();
    if (text[i] === "{") {
      i++;
      const seen = new Set<string>();
      skipWs();
      while (text[i] !== "}") {
        skipWs();
        const key = readString();
        const at = path ? `${path}.${key}` : key;
        if (seen.has(key)) dupes.push(at);
        seen.add(key);
        skipWs();
        i++; // ":"
        readValue(at);
        skipWs();
        if (text[i] === ",") i++;
        skipWs();
      }
      i++;
    } else if (text[i] === "[") {
      i++;
      skipWs();
      while (text[i] !== "]") {
        readValue(path);
        skipWs();
        if (text[i] === ",") i++;
        skipWs();
      }
      i++;
    } else if (text[i] === '"') {
      readString();
    } else {
      while (i < text.length && !/[,}\]\s]/.test(text[i])) i++;
    }
  };
  readValue("");
  return dupes;
}

describe("locale files", () => {
  it("duplicateKeys finds a repeated key", () => {
    expect(duplicateKeys('{"a":{"b":1,"b":2},"c":3}')).toEqual(["a.b"]);
  });

  for (const lang of readdirSync(LOCALES)) {
    for (const file of readdirSync(join(LOCALES, lang)).filter((f) => f.endsWith(".json"))) {
      it(`${lang}/${file} repeats no key`, () => {
        expect(duplicateKeys(readFileSync(join(LOCALES, lang, file), "utf8"))).toEqual([]);
      });
    }
  }
});
