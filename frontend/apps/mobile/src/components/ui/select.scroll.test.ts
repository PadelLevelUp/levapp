import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-655 (B-549, mobile.android-runtime rule 9b): a select's options scroll when they are
 * taller than the list box. On native, @rn-primitives/select's `Viewport` renders a bare
 * fragment, so the box capped at max-h-96 had nothing that could scroll, and a coach with more
 * than about nine levels could not reach the rest (reported on iOS, Edit student → Nível).
 * The device proof is Maestro flow 280; this pins the shape in the shared component, which
 * every select in the app goes through.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(HERE, "select.tsx"), "utf8");

describe("SelectContent scrolls its options (rule 9b, B-549)", () => {
  it("puts the options inside a ScrollView with a bounded height", () => {
    const content = src.slice(src.indexOf("function SelectContent"), src.indexOf("function SelectLabel"));
    expect(content).toMatch(/<ScrollView[\s\S]*?\{children\}[\s\S]*?<\/ScrollView>/);
    expect(content).toMatch(/maxHeight/);
  });

  it("keeps a tap on an option a tap (the keyboard or a first touch never swallows it)", () => {
    const content = src.slice(src.indexOf("function SelectContent"), src.indexOf("function SelectLabel"));
    expect(content).toContain('keyboardShouldPersistTaps="handled"');
  });
});
