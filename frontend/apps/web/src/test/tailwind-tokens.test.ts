/**
 * PAD-249 — every colour in apps/web's Tailwind config comes from the token
 * layer (`hsl(var(--token))`), never from a raw hex literal.
 *
 * `online` was a hardcoded `#22c55e` (Tailwind green-500) that survived the
 * LevApp repaint. `packages/config` tokens.ts had already remapped `online` to
 * `success` and even documented the stray, but nothing asserted that this file
 * agreed with it — `tokens.test.ts` covers the shared layer only. A raw hex is
 * wrong twice over: it is the old hue, and it cannot follow dark mode.
 *
 * This test is deliberately about the convention, not about `online`: the next
 * stray gets caught the same way.
 */
import { describe, expect, it } from "vitest";

import config from "../../tailwind.config";

const HEX = /#[0-9a-f]{3,8}\b/i;

function collectStrings(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") return [[path.join("."), node]];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      collectStrings(v, [...path, k])
    );
  }
  return [];
}

describe("apps/web tailwind colours", () => {
  const colors = (config as { theme?: { extend?: { colors?: unknown } } }).theme
    ?.extend?.colors;

  it("declares an extended colour palette", () => {
    expect(colors).toBeTruthy();
  });

  it("takes every colour from the token layer, never a raw hex literal", () => {
    const strays = collectStrings(colors).filter(([, value]) => HEX.test(value));
    expect(
      strays,
      `raw hex colours in tailwind.config.ts — use hsl(var(--token)) so the ` +
        `value follows the theme: ${strays.map(([k, v]) => `${k}=${v}`).join(", ")}`
    ).toEqual([]);
  });

  it("maps `online` to the success token, matching packages/config", () => {
    expect((colors as Record<string, unknown>).online).toBe("hsl(var(--success))");
  });
});
