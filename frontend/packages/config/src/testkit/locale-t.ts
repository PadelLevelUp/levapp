/**
 * Test-only: a `t(key, params)` over the shared locale files (frontend/src/locales/<lng>/*.json),
 * so a packages test can check a helper's key renders in both locales, with no raw key left.
 * Interpolates `{{name}}` and picks `_one`/`_other` by `count`, as i18next does. A missing key
 * returns the key itself, the way i18next shows it, so a test can assert it never does.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Dict = Record<string, unknown>;

const LOCALES = join(__dirname, "..", "..", "..", "..", "src", "locales");

function deepMerge(target: Dict, source: Dict): Dict {
  for (const [k, v] of Object.entries(source)) {
    const tv = target[k];
    if (v && typeof v === "object" && !Array.isArray(v) && tv && typeof tv === "object") deepMerge(tv as Dict, v as Dict);
    else target[k] = v;
  }
  return target;
}

const cache = new Map<string, Dict>();

function dict(lng: string): Dict {
  let d = cache.get(lng);
  if (!d) {
    d = {};
    for (const f of readdirSync(join(LOCALES, lng)).filter((n) => n.endsWith(".json"))) {
      deepMerge(d, JSON.parse(readFileSync(join(LOCALES, lng, f), "utf-8")) as Dict);
    }
    cache.set(lng, d);
  }
  return d;
}

function lookup(d: Dict, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Dict)[part] : undefined), d);
}

export function localeT(lng: "pt" | "en") {
  return (key: string, params: Record<string, unknown> = {}): string => {
    const d = dict(lng);
    let value = lookup(d, key);
    if (typeof params.count === "number") {
      const plural = lookup(d, `${key}_${params.count === 1 ? "one" : "other"}`);
      if (typeof plural === "string") value = plural;
    }
    if (typeof value !== "string") return key;
    return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(params[name] ?? ""));
  };
}
