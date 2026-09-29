/**
 * B-234 — no bare Escape to close a Select in the E2E suite.
 *
 * An Escape pressed in the first ~50 ms of a Radix Select opening reaches the layer
 * underneath; inside a Dialog or Sheet it closes the dialog too (B-231 measured it).
 * Two specs lost their dialog that way on a fast machine. Close a Select with
 * `closeSelectByChoosing` (e2e/helpers/select.ts) instead. This guard flags an Escape
 * press (`page.keyboard` or a locator's) whose preceding 12 lines, within the same test,
 * open or read a Select or a menu (an option, listbox, combobox, menu or menuitem role,
 * or a `*-select` test id). Blind spot: a Select opened by `getByLabel` or through a
 * helper leaves none of those words nearby, so the guard cannot see it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LOOKBACK = 12;
const ESCAPE = /\.press\(\s*["']Escape["']\s*\)/; // page.keyboard or a locator's press
const SELECT_OPEN =
  /getByRole\(\s*["'](option|listbox|combobox|menu|menuitem)["']|role=["']?(option|listbox|combobox|menu|menuitem)|getByTestId\(\s*["'][\w-]*select["']/;
const TEST_START = /^\s*(test|it)(\.\w+)?\(/;

export function findEscapeAfterSelect(source: string): number[] {
  const lines = source.split("\n");
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (!ESCAPE.test(line)) return;
    for (let j = i - 1; j >= Math.max(0, i - LOOKBACK); j--) {
      if (TEST_START.test(lines[j])) break;
      if (SELECT_OPEN.test(lines[j])) {
        hits.push(i + 1);
        return;
      }
    }
  });
  return hits;
}

describe("findEscapeAfterSelect", () => {
  it("flags an Escape straight after a Select's options are read", () => {
    const src = [
      'test("x", async ({ page }) => {',
      '  await page.getByRole("combobox").click();',
      '  await expect(page.getByRole("option", { name: "A" })).toBeVisible();',
      '  await page.keyboard.press("Escape");',
      "});",
    ].join("\n");
    expect(findEscapeAfterSelect(src)).toEqual([4]);
  });

  it("flags a Select opened by its *-select test id", () => {
    const src = [
      'test("x", async ({ page }) => {',
      '  await page.getByTestId("player-level-select").click();',
      '  await page.keyboard.press("Escape");',
      "});",
    ].join("\n");
    expect(findEscapeAfterSelect(src)).toEqual([3]);
  });

  it("flags a locator's Escape press after a combobox opens, not only page.keyboard", () => {
    const src = [
      'test("x", async ({ page }) => {',
      '  const box = page.getByRole("combobox");',
      '  await box.click();',
      '  await box.press("Escape");',
      "});",
    ].join("\n");
    expect(findEscapeAfterSelect(src)).toEqual([4]);
  });

  it("ignores an Escape that closes a dialog with no Select before it", () => {
    const src = [
      'test("x", async ({ page }) => {',
      '  await expect(page.getByRole("dialog")).toBeVisible();',
      '  await page.keyboard.press("Escape");',
      "});",
    ].join("\n");
    expect(findEscapeAfterSelect(src)).toEqual([]);
  });

  it("does not look back past the start of the test", () => {
    const src = [
      '  await expect(page.getByRole("option")).toBeVisible();',
      "});",
      'test("y", async ({ page }) => {',
      '  await page.keyboard.press("Escape");',
      "});",
    ].join("\n");
    expect(findEscapeAfterSelect(src)).toEqual([]);
  });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const E2E_DIR = resolve(HERE, "../../e2e");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" ? [] : walk(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("E2E suite", () => {
  it("never closes a Select with a bare Escape (use closeSelectByChoosing)", () => {
    const violations = walk(E2E_DIR).flatMap((file) =>
      findEscapeAfterSelect(readFileSync(file, "utf8")).map(
        (line) => `${relative(E2E_DIR, file)}:${line}`
      )
    );
    expect(violations).toEqual([]);
  });
});
