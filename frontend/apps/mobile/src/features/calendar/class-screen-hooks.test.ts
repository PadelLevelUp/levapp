import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-326: no React hook may be declared after the class screen's early return.
 *
 * `app/class/[id].tsx` returns early while it has no event (`if (!event) { … }`).
 * Before PAD-326 that was harmless even with hooks below it, because the event
 * was a pure function of the route params: it was either there for the whole
 * life of the screen or never there, so every render called the same hooks.
 *
 * PAD-326 made the event ASYNCHRONOUS — a route carrying only an id fetches the
 * instance, so the event starts empty and appears when the fetch resolves. From
 * that render on, any hook declared below the early return is called for the
 * first time, and React throws "Rendered more hooks than during the previous
 * render". That is a crash on exactly the path PAD-326 exists to fix.
 *
 * Nothing caught it: mobile has no render harness, `tsc` cannot see hook order,
 * and the screen's other tests read its structure, not its render sequence. It
 * was found by checking the merged gate region's BEHAVIOUR while integrating the
 * stack (#250 → #256 → #266), which is the reason this guard exists.
 *
 * Per R-032, the test proves it found its subject — the component, its early
 * return, and a healthy number of hooks above it — before asserting that none
 * sit below. A scan that finds nothing would otherwise report the screen safe.
 */

const SCREEN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../app/class/[id].tsx"
);

/** A hook call: `React.useX(`, `React.useX<T>(`, or a bare `useX(` / `useX<T>(`. */
const HOOK = /(React\.use[A-Za-z]*[<(]|[^A-Za-z.]use[A-Z][A-Za-z]*[<(])/;

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function scan() {
  expect(fs.existsSync(SCREEN), `cannot find the class screen at ${SCREEN}`).toBe(true);
  const lines = fs.readFileSync(SCREEN, "utf8").split("\n");
  const start = lines.findIndex((l) => /^export default function ClassDetailScreen\(/.test(l));
  const early = lines.findIndex((l, i) => i > start && /^  if \(!event\) \{/.test(l));
  const end = lines.findIndex((l, i) => i > start && l === "}");
  const hookLines = (from: number, to: number) =>
    lines
      .map((l, i) => ({ l, n: i + 1 }))
      .slice(from, to)
      .filter(({ l }) => !isComment(l) && HOOK.test(l));
  return { lines, start, early, end, hookLines };
}

describe("the class screen calls the same hooks on every render (PAD-326)", () => {
  it("found the component and its early return before judging either (R-032)", () => {
    const { start, early, end } = scan();
    expect(start, "the screen's default export was not found").toBeGreaterThanOrEqual(0);
    expect(early, "the `if (!event)` early return was not found").toBeGreaterThan(start);
    expect(end, "the component's closing brace was not found").toBeGreaterThan(early);
  });

  it("found hooks above the early return, so the scan is not vacuous", () => {
    const { start, early, hookLines } = scan();
    // The screen declares dozens; a handful would mean the pattern stopped
    // matching (it once missed `useState<T>(` for the angle brackets).
    expect(hookLines(start, early).length).toBeGreaterThanOrEqual(20);
  });

  it("declares no hook below the early return", () => {
    const { early, end, hookLines } = scan();
    const late = hookLines(early, end).map(({ n, l }) => `${n}: ${l.trim()}`);
    expect(
      late,
      "these hooks run only once the event exists, so the render that follows an " +
        "id-only fetch calls more hooks than the one before it and React throws. " +
        "Declare them above `if (!event)`:\n  " +
        late.join("\n  ")
    ).toEqual([]);
  });
});
