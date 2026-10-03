/**
 * PAD-510 (B-282) — the scanner behind the DOM-climb guard.
 *
 * A locator that climbs the page from something it found (an `xpath=ancestor::…`, an `xpath=..`
 * or `xpath=parent::…`, a `locator("..")`) depends on how the markup happens to be nested. Adding a
 * wrapper around a label moves where the climb lands, and the test breaks while the product is fine
 * — the wave-11 release gate was red for an hour for exactly that. Find the element by its test id or
 * its role instead.
 */
export interface Climb {
  /** Display name: `pw:<path under apps/web/e2e>`. */
  file: string;
  /** 1-based line of the climb. */
  line: number;
  /** What was matched. */
  match: string;
}

// `xpath=ancestor…`, `xpath=..`, `xpath=parent…` anywhere in a string; and a bare `locator("..")`.
const CLIMB = /xpath=\s*(?:ancestor\b|parent\b|\.\.)|\.locator\(\s*(["'`])\.\.\1\s*\)/g;

/** Every climb in one Playwright source file. */
export function scanClimbs(file: string, source: string): Climb[] {
  const out: Climb[] = [];
  source.split("\n").forEach((text, index) => {
    for (const m of text.matchAll(CLIMB)) out.push({ file, line: index + 1, match: m[0] });
  });
  return out;
}
