import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../src/locales/en.json"), "utf8")) as Record<string, unknown>;

/** The English string for a console locale key (R-013: names come from the locale file, not a literal). */
export function ui(key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
  if (typeof value !== "string") throw new Error(`no English string for locale key ${key}`);
  return value;
}
