/**
 * PAD-767 (messaging.conversation-detail rule 18): the composer's text sits on the box's vertical
 * centre. The mobile harness cannot lay out a native TextInput, so this pins the wiring: both inputs
 * (compose and edit) take the shared class and style, and the class really replaces the shared
 * Input's fixed `h-12` (tailwind-merge) with a growing box of equal top and bottom padding.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

const thread = readFileSync(join(__dirname, "..", "..", "..", "app", "conversation", "[id].tsx"), "utf8");
const input = readFileSync(join(__dirname, "..", "..", "components", "ui", "input.tsx"), "utf8");

function constant(name: string): string {
  const match = thread.match(new RegExp(`const ${name} = (.+);`));
  expect(match, name).not.toBeNull(); // R-032: the check finds its subject
  return match![1];
}

describe("the composer input is centred vertically", () => {
  it("grows from a 48 px minimum with equal top and bottom padding", () => {
    const className = JSON.parse(constant("COMPOSER_INPUT_CLASS")) as string;
    const base = input.match(/"(h-12 [^"]+)"/)![1];
    const merged = cn(base, className).split(" ");
    expect(merged).not.toContain("h-12");
    expect(merged).toEqual(expect.arrayContaining(["h-auto", "min-h-12"]));
    const vertical = merged.filter((c) => /^(py|pt|pb)-/.test(c));
    expect(vertical).toHaveLength(1);
    expect(vertical[0]).toMatch(/^py-/);
  });

  it("asks Android to centre too", () => {
    expect(constant("COMPOSER_INPUT_STYLE")).toMatch(/textAlignVertical: "center"/);
  });

  it("both the compose and the edit input use it", () => {
    for (const testID of ["message-input", "message-edit-input"]) {
      const start = thread.indexOf(`testID="${testID}"`);
      expect(start, testID).toBeGreaterThan(-1);
      const element = thread.slice(start, thread.indexOf("/>", start));
      expect(element, testID).toMatch(/className=\{`\$\{COMPOSER_INPUT_CLASS\} max-h-28 flex-1`\}/);
      expect(element, testID).toMatch(/style=\{COMPOSER_INPUT_STYLE\}/);
    }
  });
});
